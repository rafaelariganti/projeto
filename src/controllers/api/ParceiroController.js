/** Parceiros (CNPJ + foto + contrato). multipart via POST pra criar e editar. */
const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const Documento = require('../../models/Documento');
const Parceiro = require('../../models/Parceiro');
const Upload = require('../../services/Upload');
const { int, empty } = require('../../helpers');

class ParceiroController extends Controller {
  async index() {
    await this.autorizar('cad-parceiros', 'importacao');
    return Parceiro.listar();
  }

  async store() {
    await this.autorizarEdicao('cad-parceiros');
    const f = await Parceiro.campos(this.body(), null);
    const foto = Upload.salvar('foto', 'parceiros', Upload.IMAGEM, 8 * 1024 * 1024);
    const ct = Upload.salvar('contrato', 'parceiros', Upload.CONTRATO);
    Object.assign(f, { foto_path: foto?.path ?? null, foto_nome: foto?.nome ?? null, contrato_path: ct?.path ?? null, contrato_nome: ct?.nome ?? null });
    const id = await Parceiro.create(f);
    await this.log('create', 'parceiros', id, `${f.nome} (${f.cnpj})`);
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-parceiros');
    id = int(id);
    const atual = await Parceiro.findOrFail(id, 'Parceiro não encontrado');
    const f = await Parceiro.campos(this.body(), id);
    for (const k of ['foto_path', 'foto_nome', 'contrato_path', 'contrato_nome']) f[k] = atual[k];
    const foto = Upload.salvar('foto', 'parceiros', Upload.IMAGEM, 8 * 1024 * 1024);
    if (foto) {
      Upload.apagar(atual.foto_path); f.foto_path = foto.path; f.foto_nome = foto.nome;
    } else if (this.input('remover_foto') === '1') {
      Upload.apagar(atual.foto_path); f.foto_path = null; f.foto_nome = null;
    }
    const ct = Upload.salvar('contrato', 'parceiros', Upload.CONTRATO);
    if (ct) {
      Upload.apagar(atual.contrato_path); f.contrato_path = ct.path; f.contrato_nome = ct.nome;
    } else if (this.input('remover_contrato') === '1') {
      Upload.apagar(atual.contrato_path); f.contrato_path = null; f.contrato_nome = null;
    }
    await Parceiro.update(id, f);
    await this.log('update', 'parceiros', id, `${f.nome} (${f.cnpj})`);
    return { ok: true };
  }

  async situacao(id) {
    await this.autorizarEdicao('cad-parceiros');
    id = int(id);
    const row = await Parceiro.findOrFail(id, 'Parceiro não encontrado');
    const ativo = !empty(this.input('ativo')) ? 1 : 0;
    await Parceiro.update(id, { ativo });
    await this.log('update', 'parceiros', id, row.nome + (ativo ? ' — ativado' : ' — desativado'));
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-parceiros');
    id = int(id);
    const row = await Parceiro.findOrFail(id, 'Parceiro não encontrado');
    await Parceiro.delete(id);
    Upload.apagar(row.foto_path); Upload.apagar(row.contrato_path);
    for (const d of await Documento.doParceiro(id)) Upload.apagar(d.arquivo_path);
    await Database.run('DELETE FROM documentos WHERE parceiro_id=?', [id]);
    await this.log('delete', 'parceiros', id, row.nome, null, row);
    return { ok: true };
  }
}

module.exports = ParceiroController;
