/** Contratos/aditivos de parceiros e fornecedores, notas fiscais, contrato principal. */
const Controller = require('../../core/Controller');
const Auth = require('../../core/Auth');
const Database = require('../../core/Database');
const { HttpException } = require('../../core/HttpException');
const Documento = require('../../models/Documento');
const Upload = require('../../services/Upload');
const { cut, str_or_null, public_path, int } = require('../../helpers');

// Contrato principal (anexar/substituir/remover sem reenviar o cadastro)
const CONTRATO = { parceiros: ['cad-parceiros', 'Parceiro'], fornecedores: ['cad-fornecedores', 'Fornecedor'] };

class DocumentoController extends Controller {
  /** Contrato de parceiro/fornecedor também é gerido de dentro da própria tela. */
  async permitir(tipo, editar) {
    const tela = tipo === 'contrato_parceiro' ? 'cad-parceiros' : (tipo === 'contrato_fornecedor' ? 'cad-fornecedores' : 'importacao');
    if (editar) await this.autorizarEdicao(tela); else await this.autorizar(tela, 'importacao');
  }

  async index() {
    const tipo = this.query('tipo');
    if (tipo && !Documento.TIPOS.includes(tipo)) throw new HttpException(400, 'Tipo inválido');
    await this.permitir(tipo, false);
    return Documento.listar(tipo, this.query('parceiro_id') ? int(this.query('parceiro_id')) : null, this.query('fornecedor_id') ? int(this.query('fornecedor_id')) : null);
  }

  async store() {
    const tipo = this.input('tipo');
    if (!Documento.TIPOS.includes(tipo)) throw new HttpException(400, 'Tipo inválido');
    await this.permitir(tipo, true);
    const parceiroId = this.input('parceiro_id') ? int(this.input('parceiro_id')) : null;
    const fornecedorId = this.input('fornecedor_id') ? int(this.input('fornecedor_id')) : null;
    if (tipo === 'contrato_parceiro' && (!parceiroId || !(await Database.one('SELECT id FROM parceiros WHERE id=?', [parceiroId])))) throw new HttpException(400, 'Selecione o parceiro');
    if (tipo === 'contrato_fornecedor' && (!fornecedorId || !(await Database.one('SELECT id FROM fornecedores WHERE id=?', [fornecedorId])))) throw new HttpException(400, 'Selecione o fornecedor');
    const arq = await Upload.salvar('arquivo', 'documentos', Upload.DOCUMENTO);
    if (!arq) throw new HttpException(400, 'Arquivo não enviado');
    const id = await Documento.create({
      tipo, parceiro_id: parceiroId, fornecedor_id: fornecedorId,
      descricao: cut(str_or_null(this.input('descricao')), 255), arquivo_path: arq.path, arquivo_nome: arq.nome,
      user_id: Auth.atual().id,
    });
    await this.log('create', 'documentos', id, `${tipo}: ${arq.nome}`);
    return { id };
  }

  async destroy(id) {
    id = int(id);
    const row = await Documento.findOrFail(id, 'Documento não encontrado');
    await this.permitir(row.tipo, true);
    await Documento.delete(id);
    await Upload.apagar(row.arquivo_path);
    await this.log('delete', 'documentos', id, row.arquivo_nome, null, row);
    return { ok: true };
  }

  async anexarContrato(tabela, id) {
    const [tela, label] = CONTRATO[tabela];
    await this.autorizarEdicao(tela);
    id = int(id);
    const row = await Database.one(`SELECT id, nome, contrato_path FROM \`${tabela}\` WHERE id=?`, [id]);
    if (!row) throw new HttpException(404, `${label} não encontrado`);
    const ct = await Upload.salvar('contrato', tabela, Upload.CONTRATO);
    if (!ct) throw new HttpException(400, 'Arquivo não enviado');
    await Upload.apagar(row.contrato_path);
    await Database.run(`UPDATE \`${tabela}\` SET contrato_path=?, contrato_nome=? WHERE id=?`, [ct.path, ct.nome, id]);
    await this.log('update', tabela, id, `${row.nome} — contrato anexado: ${ct.nome}`);
    return { contrato_path: public_path(ct.path), contrato_nome: ct.nome };
  }

  async removerContrato(tabela, id) {
    const [tela, label] = CONTRATO[tabela];
    await this.autorizarEdicao(tela);
    id = int(id);
    const row = await Database.one(`SELECT id, nome, contrato_path FROM \`${tabela}\` WHERE id=?`, [id]);
    if (!row) throw new HttpException(404, `${label} não encontrado`);
    await Upload.apagar(row.contrato_path);
    await Database.run(`UPDATE \`${tabela}\` SET contrato_path=NULL, contrato_nome=NULL WHERE id=?`, [id]);
    await this.log('update', tabela, id, `${row.nome} — contrato removido`);
    return { ok: true };
  }
}

module.exports = DocumentoController;
