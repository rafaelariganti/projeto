/** Lançamentos (receitas/despesas) e transferências entre caixas. */
const path = require('path');
const Controller = require('../../core/Controller');
const Arquivo = require('../../core/Arquivo');
const { HttpException } = require('../../core/HttpException');
const Despachante = require('../../eventos/Despachante');
const Evento = require('../../eventos/Evento');
const Transacao = require('../../models/Transacao');
const Transferencia = require('../../models/Transferencia');
const Upload = require('../../services/Upload');
const { diff_log, round, float, int } = require('../../helpers');

const COMPROVANTE_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
const COMPROVANTE_MAX = 10 * 1024 * 1024;
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Pelo formulário, a data é obrigatória conforme a situação (a importação continua aceitando sem). */
function exigirDatas(f) {
  if (f.status === 'em_aberto' && !f.data_vencimento) throw new HttpException(400, 'Conta em aberto precisa da data de vencimento.');
  if (f.status === 'quitado' && !f.data_pagamento) throw new HttpException(400, 'Lançamento quitado precisa da data de pagamento.');
}

class TransacaoController extends Controller {
  async index() {
    await this.autorizar('lancamentos');
    return Transacao.listar({
      year: this.query('year'), month: this.query('month'), type: this.query('type'),
      status: this.query('status'), categoria_id: this.query('categoria_id'),
      centro_custo: this.query('centro_custo'), forma_pagamento: this.query('forma_pagamento'),
      caixa_banco: this.query('caixa_banco'), importacao_id: this.query('importacao_id'),
    });
  }

  async emAberto() {
    await this.autorizar('dashboard', 'lancamentos', 'calendario');
    return Transacao.emAberto();
  }

  async store() {
    const u = await this.autorizarEdicao('lancamentos');
    const f = await Transacao.campos(this.body());
    exigirDatas(f);
    f.user_id = u.id;
    const id = await Transacao.create(f);
    await this.log('create', 'transactions', id, `${f.tipo} - ${f.descricao} - R$${f.valor}`);
    // Observer: quem precisa reagir (ex.: vincular a nota fiscal de origem) está em src/eventos.js.
    await Despachante.disparar(new Evento(Evento.LANCAMENTO_CRIADO, { ...f, id, nota_fiscal_id: int(this.input('nota_fiscal_id', 0)) }));
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    const atual = await Transacao.findOrFail(id, 'Lançamento não encontrado');
    const f = await Transacao.campos(this.body());
    exigirDatas(f);
    // Taxa de cartão é a do dia do lançamento: se a forma ou o valor não mudaram, mantém a taxa original
    // (mudar a taxa da forma de pagamento depois não pode alterar o DRE de meses passados).
    if (f.tipo === atual.tipo && f.forma_pagamento_nome === String(atual.forma_pagamento_nome ?? '') && Math.abs(f.valor - float(atual.valor)) < 0.005) {
      f.taxa_mdr = round(float(atual.taxa_mdr), 2);
      f.valor_liquido = round(f.valor - f.taxa_mdr, 2);
    }
    await Transacao.update(id, f);
    const diff = diff_log(atual, f, Transacao.ROTULOS);
    await this.log('update', 'transactions', id, `${f.tipo} - ${f.descricao} - R$${f.valor}` + (diff ? ` — ${diff}` : ''));
    return { ok: true };
  }

  /** Baixa / reabrir (atualização parcial). */
  async patch(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    await Transacao.findOrFail(id, 'Lançamento não encontrado');
    const b = this.body(); const d = {};
    if (tem(b, 'status')) d.status = b.status === 'em_aberto' ? 'em_aberto' : 'quitado';
    if (tem(b, 'data_pagamento')) d.data_pagamento = (b.data_pagamento && /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_pagamento))) ? b.data_pagamento : null;
    if (tem(b, 'observacoes')) d.observacoes = String(b.observacoes ?? '');
    if (!Object.keys(d).length) throw new HttpException(400, 'Nenhum campo para atualizar');
    await Transacao.update(id, d);
    await this.log((b.status ?? '') === 'quitado' ? 'baixa' : 'update_status', 'transactions', id, b.status ?? null);
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    const row = await Transacao.findOrFail(id, 'Lançamento não encontrado');
    await Transacao.delete(id);
    await Despachante.disparar(new Evento(Evento.LANCAMENTO_APAGADO, { ...row, id }));
    await this.log('delete', 'transactions', id, `${row.tipo} - ${row.descricao} - R$${row.valor}`, null, row);
    return { ok: true };
  }

  // ─── Comprovante (PDF ou foto do pagamento/recebimento) ─────────────────
  /** Anexa ou substitui o comprovante do lançamento. */
  async anexarComprovante(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    const row = await Transacao.findOrFail(id, 'Lançamento não encontrado');
    const f = Upload.lista('comprovante')[0] ?? null;
    if (!f) throw new HttpException(400, 'Escolha o arquivo do comprovante (PDF ou imagem)');
    const arq = await Upload.salvarPrivado(f, 'comprovantes', COMPROVANTE_EXTS, COMPROVANTE_MAX);
    await Upload.apagar(row.comprovante_path);
    await Transacao.update(id, { comprovante_path: arq.path, comprovante_nome: arq.nome });
    await this.log('update', 'transactions', id, `${row.descricao} — comprovante ` + (row.comprovante_path ? 'substituído' : 'anexado') + `: ${arq.nome}`);
    return { ok: true, tem_comprovante: true, comprovante_nome: arq.nome };
  }

  async removerComprovante(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    const row = await Transacao.findOrFail(id, 'Lançamento não encontrado');
    if (!row.comprovante_path) throw new HttpException(400, 'Esse lançamento não tem comprovante');
    await Upload.apagar(row.comprovante_path);
    await Transacao.update(id, { comprovante_path: null, comprovante_nome: null });
    await this.log('update', 'transactions', id, `${row.descricao} — comprovante removido: ${row.comprovante_nome}`);
    return { ok: true, tem_comprovante: false };
  }

  /** Entrega o arquivo só pra quem vê lançamentos ou o calendário (fica fora da pasta pública). */
  async verComprovante(id) {
    await this.autorizar('lancamentos', 'calendario');
    const row = await Transacao.findOrFail(int(id), 'Lançamento não encontrado');
    const conteudo = await Upload.lerPrivado(row.comprovante_path);
    if (!conteudo) throw new HttpException(404, 'Comprovante não encontrado');
    const ext = path.extname(String(row.comprovante_path)).slice(1).toLowerCase();
    const mime = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] ?? 'application/octet-stream';
    const nome = String(row.comprovante_nome || `comprovante-${row.id}.${ext}`);
    Arquivo.enviar(conteudo, mime, nome, { download: this.query('download') === '1', headers: { 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'SAMEORIGIN' } });
  }

  // ─── Transferências ─────────────────────────────────────────────────────
  async transferencias() {
    await this.autorizar('lancamentos');
    return Transferencia.listar(this.query('year') ? int(this.query('year')) : null, this.query('month') ? int(this.query('month')) : null);
  }

  async criarTransferencia() {
    const u = await this.autorizarEdicao('lancamentos');
    const f = { ...Transferencia.campos(this.body()), user_id: u.id };
    const id = await Transferencia.create(f);
    await this.log('create', 'transfers', id, `${f.origem_nome} → ${f.destino_nome} - R$${f.valor}`);
    return { id };
  }

  async apagarTransferencia(id) {
    await this.autorizarEdicao('lancamentos');
    id = int(id);
    const row = await Transferencia.findOrFail(id, 'Transferência não encontrada');
    await Transferencia.delete(id);
    await this.log('delete', 'transfers', id, `${row.origem_nome} → ${row.destino_nome} - R$${row.valor}`, null, row);
    return { ok: true };
  }
}

module.exports = TransacaoController;
