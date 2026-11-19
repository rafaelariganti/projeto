/** Fornecedores (multipart/form-data via POST pra criar e editar, igual parceiros). */
const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const Request = require('../../core/Request');
const Documento = require('../../models/Documento');
const Fornecedor = require('../../models/Fornecedor');
const Upload = require('../../services/Upload');
const { int, empty } = require('../../helpers');

class FornecedorController extends Controller {
  async index() {
    await this.autorizar('cad-fornecedores', 'importacao', 'lancamentos');
    return Fornecedor.listar();
  }

  async store() {
    await this.autorizarEdicao('cad-fornecedores');
    const f = await Fornecedor.campos(this.body(), null);
    const ct = Upload.salvar('contrato', 'fornecedores', Upload.CONTRATO);
    f.contrato_path = ct?.path ?? null; f.contrato_nome = ct?.nome ?? null;
    const id = await Fornecedor.create(f);
    await this.log('create', 'fornecedores', id, `${f.nome} (${f.cnpj_cpf ?? ''})`);
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-fornecedores');
    id = int(id);
    const atual = await Fornecedor.findOrFail(id, 'Fornecedor não encontrado');
    const f = await Fornecedor.campos(this.body(), id);
    // Campos que a tela não mostra (cidade/UF) ficam como estavam.
    for (const k of ['cidade', 'estado', 'telefone']) if (!Request.has(k)) f[k] = atual[k];
    f.contrato_path = atual.contrato_path; f.contrato_nome = atual.contrato_nome;
    const ct = Upload.salvar('contrato', 'fornecedores', Upload.CONTRATO);
    if (ct) {
      Upload.apagar(atual.contrato_path); f.contrato_path = ct.path; f.contrato_nome = ct.nome;
    } else if (this.input('remover_contrato') === '1') {
      Upload.apagar(atual.contrato_path); f.contrato_path = null; f.contrato_nome = null;
    }
    await Fornecedor.update(id, f);
    // Lançamentos guardam o nome do fornecedor como texto — mantém em dia ao renomear.
    if (f.nome !== atual.nome) await Database.run('UPDATE transactions SET cliente_fornecedor=? WHERE cliente_fornecedor=?', [f.nome, atual.nome]);
    await this.log('update', 'fornecedores', id, `${f.nome} (${f.cnpj_cpf ?? ''})`);
    return { ok: true };
  }

  async situacao(id) {
    await this.autorizarEdicao('cad-fornecedores');
    id = int(id);
    const row = await Fornecedor.findOrFail(id, 'Fornecedor não encontrado');
    const ativo = !empty(this.input('ativo')) ? 1 : 0;
    await Fornecedor.update(id, { ativo });
    await this.log('update', 'fornecedores', id, row.nome + (ativo ? ' — ativado' : ' — desativado'));
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-fornecedores');
    id = int(id);
    const row = await Fornecedor.findOrFail(id, 'Fornecedor não encontrado');
    await Fornecedor.delete(id);
    Upload.apagar(row.contrato_path);
    for (const d of await Documento.doFornecedor(id)) Upload.apagar(d.arquivo_path);
    await Database.run('DELETE FROM documentos WHERE fornecedor_id=?', [id]);
    await this.log('delete', 'fornecedores', id, row.nome, null, row);
    return { ok: true };
  }
}

module.exports = FornecedorController;
