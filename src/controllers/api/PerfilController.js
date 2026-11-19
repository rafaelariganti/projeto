/** Níveis de acesso (só administrador). */
const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const Permissions = require('../../core/Permissions');
const { HttpException } = require('../../core/HttpException');
const Perfil = require('../../models/Perfil');
const { cut, str_or_null, mb_substr, int } = require('../../helpers');

class PerfilController extends Controller {
  async index() {
    await this.somenteAdmin();
    return { perfis: await Perfil.listar(), telas: Permissions.catalogo() };
  }

  async store() {
    await this.somenteAdmin();
    const f = { ...(await Perfil.campos(null)), is_admin: 0, sistema: 0 };
    const id = await Perfil.create(f);
    await this.log('create', 'perfis', id, f.nome);
    return { id };
  }

  async update(id) {
    await this.somenteAdmin();
    id = int(id);
    const atual = await Perfil.findOrFail(id, 'Nível de acesso não encontrado');
    if (int(atual.is_admin)) {
      // Administrador sempre tem tudo: só nome e descrição mudam.
      const nome = String(this.input('nome', atual.nome) ?? '').trim() || atual.nome;
      if (await Database.one('SELECT id FROM perfis WHERE nome=? AND id<>?', [nome, id])) throw new HttpException(400, 'Já existe um nível com esse nome');
      await Perfil.update(id, { nome: mb_substr(nome, 0, 80), descricao: cut(str_or_null(this.input('descricao')), 255) });
      await this.log('update', 'perfis', id, nome);
      return { ok: true };
    }
    const f = await Perfil.campos(id);
    await Perfil.update(id, f);
    const diff = Perfil.diffPermissoes(Permissions.normalizar(atual.permissoes), JSON.parse(f.permissoes));
    await this.log('update', 'perfis', id, f.nome + (diff ? ` — ${diff}` : ''));
    return { ok: true };
  }

  /** Apaga o nível. Se tiver usuários, precisa dizer pra qual nível eles vão (?mover_para=ID). */
  async destroy(id) {
    await this.somenteAdmin();
    id = int(id);
    const p = await Perfil.findOrFail(id, 'Nível de acesso não encontrado');
    if (int(p.sistema) || int(p.is_admin)) throw new HttpException(400, 'O nível Administrador não pode ser apagado');
    const qtd = int(await Database.value('SELECT COUNT(*) FROM users WHERE perfil_id=?', [id]));
    if (qtd) {
      const destino = int(this.query('mover_para', 0));
      const d = destino && destino !== id ? await Perfil.find(destino) : null;
      if (!d) throw new HttpException(400, `${qtd} usuário(s) usam este nível. Escolha para qual nível eles vão antes de apagar.`);
      await Database.run('UPDATE users SET perfil_id=?, role=? WHERE perfil_id=?', [destino, int(d.is_admin) ? 'admin' : 'user', id]);
    }
    await Perfil.delete(id);
    await this.log('delete', 'perfis', id, p.nome + (qtd ? ` — ${qtd} usuário(s) movidos` : ''), null, p);
    return { ok: true };
  }
}

module.exports = PerfilController;
