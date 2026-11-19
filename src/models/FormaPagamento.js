const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, agencia_valida, round, num, int, float } = require('../helpers');

class FormaPagamento extends Model {
  static table = 'formas_pagamento';

  static TIPOS = ['credito', 'debito', 'pix', 'boleto', 'transferencia', 'dinheiro'];
  static ROTULOS = { nome: 'nome', tipo: 'tipo', banco: 'banco', agencia: 'agência', parcelas: 'parcelas',
    dias_recebimento: 'dias p/ recebimento', taxa_intermediacao: 'taxa intermediação %', taxa_parcelamento: 'taxa parcelamento %',
    tarifa_fixa: 'tarifa fixa R$' };

  static out(r) {
    r = { ...r };
    for (const k of ['taxa_intermediacao', 'taxa_parcelamento', 'tarifa_fixa']) r[k] = float(r[k]);
    for (const k of ['id', 'parcelas', 'dias_recebimento', 'ativo']) r[k] = int(r[k] ?? 1);
    if (r.qtd_lanc !== undefined && r.qtd_lanc !== null) r.qtd_lanc = int(r.qtd_lanc);
    return r;
  }

  static async listar() {
    return (await Database.all('SELECT f.*, (SELECT COUNT(*) FROM transactions t WHERE t.forma_pagamento_nome=f.nome) qtd_lanc FROM formas_pagamento f ORDER BY f.ativo DESC, f.nome')).map(FormaPagamento.out);
  }

  static async campos(inp, id) {
    const nome = String(inp.nome ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Campo obrigatório: Nome');
    if (await Database.one('SELECT id FROM formas_pagamento WHERE nome=?' + (id ? ' AND id<>?' : ''), id ? [nome, id] : [nome])) throw new HttpException(400, 'Já existe uma forma de pagamento com esse nome');
    const tipo = inp.tipo ?? '';
    if (!FormaPagamento.TIPOS.includes(tipo)) throw new HttpException(400, 'Escolha o tipo da forma de pagamento');
    const pct = (k) => Math.min(100, Math.max(0, round(num(inp[k] ?? 0), 2)));
    const c = (k, n) => cut(str_or_null(inp[k] ?? null), n);
    return {
      nome: mb_substr(nome, 0, 100), tipo,
      banco: tipo === 'dinheiro' ? null : c('banco', 100),
      agencia: tipo === 'dinheiro' ? null : agencia_valida(inp.agencia ?? null),
      parcelas: tipo === 'credito' ? Math.min(48, Math.max(1, Math.trunc(num(inp.parcelas ?? 1)))) : 1,
      dias_recebimento: Math.min(365, Math.max(0, Math.trunc(num(inp.dias_recebimento ?? 0)))),
      taxa_intermediacao: pct('taxa_intermediacao'),
      taxa_parcelamento: tipo === 'credito' ? pct('taxa_parcelamento') : 0,
      tarifa_fixa: Math.min(9999.99, Math.max(0, round(num(inp.tarifa_fixa ?? 0), 2))),
    };
  }

  static async uso(nome) {
    return int(await Database.value('SELECT COUNT(*) FROM transactions WHERE forma_pagamento_nome=?', [nome]));
  }

  /** Só as ativas — alimenta os selects de lançamento (a inativa continua nos lançamentos antigos). */
  static async resumo() {
    return Database.all('SELECT nome, tipo, taxa_intermediacao, tarifa_fixa FROM formas_pagamento WHERE ativo=1 ORDER BY id');
  }

  /** Primeira forma ativa de um tipo (usada pra sugerir a forma a partir do XML da nota). */
  static async ativaDoTipo(tipo) {
    const n = await Database.value('SELECT nome FROM formas_pagamento WHERE ativo=1 AND tipo=? ORDER BY id LIMIT 1', [tipo]);
    return n !== null && n !== undefined ? String(n) : null;
  }
}

module.exports = FormaPagamento;
