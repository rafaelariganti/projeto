/** Gerenciamento de usuários (só administrador). */
const Controller = require('../../core/Controller');
const { HttpException } = require('../../core/HttpException');
const Perfil = require('../../models/Perfil');
const User = require('../../models/User');
const Upload = require('../../services/Upload');
const { cut, str_or_null, senha_fraca, filter_email, agora, int, empty } = require('../../helpers');

class UsuarioController extends Controller {
  async index() {
    await this.somenteAdmin();
    return User.listar();
  }

  async perfilValido(id) {
    const p = id ? await Perfil.find(int(id)) : null;
    if (!p) throw new HttpException(400, 'Escolha o nível de acesso');
    return p;
  }

  /** Senha: "gerar" cria uma provisória (devolvida uma única vez) ou "definir" usa a digitada. */
  senhaDoFormulario() {
    if (this.input('senha_modo', 'gerar') === 'definir') {
      const s = String(this.input('password', '') ?? '');
      const err = senha_fraca(s);
      if (err) throw new HttpException(400, err);
      return [s, false];
    }
    return [User.senhaProvisoria(), true];
  }

  async store() {
    await this.somenteAdmin();
    const username = String(this.input('username', '') ?? '').trim();
    await User.validarUsername(username);
    const perfil = await this.perfilValido(this.input('perfil_id'));
    const email = str_or_null(this.input('email'));
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    const [senha, gerada] = this.senhaDoFormulario();
    const trocar = gerada || !empty(this.input('trocar_senha', true));
    const id = await User.create({
      username, nome: cut(str_or_null(this.input('nome')), 150), email: cut(email, 150),
      password: User.hash(senha), role: int(perfil.is_admin) ? 'admin' : 'user',
      perfil_id: int(perfil.id), ativo: 1, deve_trocar_senha: trocar ? 1 : 0,
      senha_alterada_em: agora(),
    });
    await this.log('create', 'users', id, `${username} — nível: ${perfil.nome}` + (trocar ? ' — troca de senha no 1º acesso' : ''));
    return { id, username, senha_provisoria: gerada ? senha : null };
  }

  async update(id) {
    const eu = await this.somenteAdmin();
    id = int(id);
    const atual = await User.comPerfil(id);
    if (!atual) throw new HttpException(404, 'Usuário não encontrado');
    const username = String(this.input('username', atual.username) ?? '').trim();
    await User.validarUsername(username, id);
    const perfil = await this.perfilValido(this.input('perfil_id', atual.perfil_id));
    const email = str_or_null(this.input('email'));
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    const viraAdmin = int(perfil.is_admin) === 1;
    // Não deixa o sistema ficar sem administrador ativo (nem o admin se rebaixar).
    if (int(atual.is_admin) && !viraAdmin) {
      if (id === int(eu.id)) throw new HttpException(400, 'Você não pode tirar o seu próprio acesso de administrador');
      if (!(await User.adminsRestantes(id))) throw new HttpException(400, 'O sistema precisa de pelo menos um administrador ativo');
    }
    await User.update(id, {
      username, nome: cut(str_or_null(this.input('nome')), 150), email: cut(email, 150),
      perfil_id: int(perfil.id), role: viraAdmin ? 'admin' : 'user',
    });
    const mud = [];
    if (int(atual.perfil_id) !== int(perfil.id)) mud.push('nível: ' + (atual.perfil_nome ?? '∅') + ' → ' + perfil.nome);
    if (atual.username !== username) mud.push(`usuário: ${atual.username} → ${username}`);
    await this.log(mud.length && int(atual.perfil_id) !== int(perfil.id) ? 'update_role' : 'update', 'users', id, username + (mud.length ? ' — ' + mud.join('; ') : ''));
    return { ok: true };
  }

  /** Redefine a senha de outra pessoa. A sessão dela cai na hora. */
  async senha(id) {
    await this.somenteAdmin();
    id = int(id);
    const u = await User.findOrFail(id, 'Usuário não encontrado');
    const [senha, gerada] = this.senhaDoFormulario();
    const trocar = gerada || !empty(this.input('trocar_senha', true));
    await User.definirSenha(id, senha, trocar);
    await this.log('reset_senha', 'users', id, u.username + (gerada ? ' — senha provisória gerada' : ' — senha definida pelo administrador'));
    return { ok: true, senha_provisoria: gerada ? senha : null };
  }

  async situacao(id) {
    const eu = await this.somenteAdmin();
    id = int(id);
    const u = await User.comPerfil(id);
    if (!u) throw new HttpException(404, 'Usuário não encontrado');
    const ativo = !empty(this.input('ativo')) ? 1 : 0;
    if (!ativo) {
      if (id === int(eu.id)) throw new HttpException(400, 'Você não pode desativar o próprio acesso');
      if (int(u.is_admin) && !(await User.adminsRestantes(id))) throw new HttpException(400, 'O sistema precisa de pelo menos um administrador ativo');
    }
    await User.update(id, { ativo });
    await this.log('update', 'users', id, u.username + (ativo ? ' — acesso reativado' : ' — acesso desativado'));
    return { ok: true };
  }

  async desbloquear(id) {
    await this.somenteAdmin();
    const u = await User.findOrFail(int(id), 'Usuário não encontrado');
    await User.desbloquear(int(id));
    await this.log('update', 'users', int(id), u.username + ' — desbloqueado');
    return { ok: true };
  }

  async destroy(id) {
    const eu = await this.somenteAdmin();
    id = int(id);
    if (id === int(eu.id)) throw new HttpException(400, 'Você não pode apagar a si mesmo');
    const u = await User.comPerfil(id);
    if (!u) throw new HttpException(404, 'Usuário não encontrado');
    if (int(u.is_admin) && !(await User.adminsRestantes(id))) throw new HttpException(400, 'O sistema precisa de pelo menos um administrador ativo');
    await User.delete(id);
    Upload.apagar(u.foto_path);
    const copia = { ...u }; delete copia.perfil_permissoes; delete copia.perfil_admin;
    await this.log('delete', 'users', id, `${u.username} (${u.perfil_nome})`, null, copia);
    return { ok: true };
  }
}

module.exports = UsuarioController;
