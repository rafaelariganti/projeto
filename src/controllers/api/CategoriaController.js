const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const { HttpException } = require('../../core/HttpException');
const Categoria = require('../../models/Categoria');
const { int, ano_atual } = require('../../helpers');

class CategoriaController extends Controller {
  async index() {
    await this.autorizar('cad-categorias', 'lancamentos');
    return Categoria.listar(int(this.query('year', ano_atual())));
  }

  async store() {
    await this.autorizarEdicao('cad-categorias');
    const f = Categoria.campos(this.body());
    if (await Categoria.duplicada(f.nome, f.tipo)) throw new HttpException(400, 'Já existe uma categoria com esse nome e tipo');
    const id = await Categoria.create(f);
    await this.log('create', 'categorias', id, f.nome);
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-categorias');
    id = int(id);
    const atual = await Categoria.findOrFail(id, 'Categoria não encontrada');
    const f = Categoria.campos(this.body());
    if (await Categoria.duplicada(f.nome, f.tipo, id)) throw new HttpException(400, 'Já existe uma categoria com esse nome e tipo');
    // Não deixa mudar o tipo se isso deixaria lançamentos com categoria incompatível.
    if (f.tipo !== 'ambos' && f.tipo !== atual.tipo) {
      const conflito = int(await Database.value('SELECT COUNT(*) FROM transactions WHERE categoria_id=? AND tipo<>?', [id, f.tipo]));
      if (conflito) throw new HttpException(400, `Existem ${conflito} lançamento(s) do outro tipo usando essa categoria. Use "Ambos" ou troque a categoria deles antes.`);
    }
    await Categoria.update(id, f);
    if (f.nome !== atual.nome) await Database.run('UPDATE transactions SET categoria_nome=? WHERE categoria_id=?', [f.nome, id]);
    await this.log('update', 'categorias', id, f.nome);
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-categorias');
    id = int(id);
    const row = await Categoria.findOrFail(id, 'Categoria não encontrada');
    const uso = int(await Database.value('SELECT COUNT(*) FROM transactions WHERE categoria_id=?', [id]));
    if (uso) throw new HttpException(400, `Categoria usada em ${uso} lançamento(s). Desative em vez de excluir, pra não perder o histórico.`);
    await Categoria.delete(id);
    await this.log('delete', 'categorias', id, row.nome, null, row);
    return { ok: true };
  }
}

module.exports = CategoriaController;
