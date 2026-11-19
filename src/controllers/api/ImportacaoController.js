/** Importação de planilhas (lançamentos, clientes, fornecedores). */
const Controller = require('../../core/Controller');
const Request = require('../../core/Request');
const Response = require('../../core/Response');
const { HttpException } = require('../../core/HttpException');
const Importacao = require('../../models/Importacao');
const ImportService = require('../../services/ImportService');
const XlsxWriter = require('../../services/Spreadsheet/XlsxWriter');
const Csv = require('../../services/Spreadsheet/Csv');
const { number_format, int } = require('../../helpers');

const obj = (v) => (v && typeof v === 'object' ? v : {});

class ImportacaoController extends Controller {
  /** Histórico. */
  async index() {
    await this.autorizar('importacao');
    return Importacao.listar();
  }

  tipo() {
    const t = String(this.input('tipo') ?? this.query('tipo', '') ?? '');
    if (!ImportService.TIPOS[t]) throw new HttpException(400, 'Escolha o que vai importar');
    return t;
  }

  /** Importar cadastros exige editar o cadastro correspondente também. */
  async autorizarTipo(tipo) {
    await this.autorizarEdicao('importacao');
    if (tipo === 'lancamentos') await this.autorizarEdicao('lancamentos');
    if (tipo === 'clientes') await this.autorizarEdicao('cad-clientes');
    if (tipo === 'fornecedores') await this.autorizarEdicao('cad-fornecedores');
  }

  /** Passo 1: recebe o arquivo e devolve colunas + mapeamento sugerido. */
  async analisar() {
    const tipo = this.tipo();
    await this.autorizarTipo(tipo);
    let arq = Request.file('arquivo');
    if (Array.isArray(arq)) arq = arq[0];
    if (!arq) throw new HttpException(400, 'Envie o arquivo da planilha');
    return ImportService.analisar(tipo, arq, String(this.input('cabecalho', '1') ?? '1') !== '0');
  }

  /** Passo 2: prévia linha a linha. */
  async validar() {
    const tipo = this.tipo();
    await this.autorizarTipo(tipo);
    return ImportService.processar(String(this.input('token', '') ?? ''), obj(this.input('mapeamento', {})), obj(this.input('opcoes', {})));
  }

  /** Passo 3: grava. */
  async confirmar() {
    const tipo = this.tipo();
    await this.autorizarTipo(tipo);
    const t0 = Date.now();
    const r = await ImportService.confirmar(String(this.input('token', '') ?? ''), obj(this.input('mapeamento', {})), obj(this.input('opcoes', {})));
    const ms = Date.now() - t0;
    await this.log('import', 'importacoes', r.id, ImportService.TIPOS[tipo] + `: ${r.importados} importado(s), ${r.ignorados} ignorado(s) — ${r.arquivo} — gravado em ${ms} ms`);
    return { ...r, tempo_ms: ms };
  }

  /** Desfaz: apaga o que a importação criou. */
  async desfazer(id) {
    const imp = await Importacao.findOrFail(int(id), 'Importação não encontrada');
    await this.autorizarTipo(imp.tipo);
    if (imp.desfeita_em) throw new HttpException(400, 'Essa importação já foi desfeita');
    const copia = await Importacao.registros(imp);
    const n = await Importacao.desfazer(imp);
    await this.log('undo_import', 'importacoes', int(id), `${imp.arquivo_nome} — ${n} registro(s) removido(s)`, null, copia.length ? copia : null);
    return { ok: true, removidos: n };
  }

  /** Planilha modelo (xlsx ou csv). */
  async modelo() {
    await this.autorizar('importacao');
    const tipo = String(this.query('tipo', 'lancamentos'));
    if (!ImportService.TIPOS[tipo]) throw new HttpException(400, 'Tipo inválido');
    const rows = ImportService.modelo(tipo);
    if (this.query('formato') === 'csv') {
      const linhas = rows.map((r) => r.map((v) => (XlsxWriter.ehDinheiro(v) ? number_format(v.v, 2, ',', '') : v)));
      Response.download(Csv.gerar(linhas), 'text/csv; charset=utf-8', `modelo_${tipo}.csv`);
    }
    const x = new XlsxWriter();
    x.addSheet(ImportService.TIPOS[tipo], rows);
    Response.download(x.output(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `modelo_${tipo}.xlsx`);
  }
}

module.exports = ImportacaoController;
