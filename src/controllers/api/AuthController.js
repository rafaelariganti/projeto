/** Login, primeiro acesso, troca de senha, perfil próprio. */
const Controller = require('../../core/Controller');
const Auth = require('../../core/Auth');
const Csrf = require('../../core/Csrf');
const Database = require('../../core/Database');
const Termos = require('../../core/Termos');
const { HttpException } = require('../../core/HttpException');
const RateLimit = require('../../models/RateLimit');
const User = require('../../models/User');
const Upload = require('../../services/Upload');
const config = require('../../bootstrap');
const { cut, str_or_null, senha_fraca, client_ip, agora, time, mb_substr, only_digits, filter_email, int, empty } = require('../../helpers');

/** Hash qualquer: quando o usuário não existe a verificação leva o mesmo tempo (não entrega quais usuários existem). */
const HASH_FALSO = '$2y$10$EY8aN5to9FtwX.TH5iOpkeIXM1WmUcx2mUDVkMf8fBy7uzOxbyFyu';

class AuthController extends Controller {
  async setupStatus() {
    return { needsSetup: (await User.count()) === 0, version: config.APP_VERSION };
  }

  /** Cadastro público só existe pro primeiro acesso (banco sem usuários) — esse vira administrador. */
  async register() {
    await RateLimit.verificar('register', 5, 600);
    if ((await User.count()) > 0) throw new HttpException(403, 'Cadastro público desativado. Peça a um administrador para criar seu acesso.');
    const username = String(this.input('username', '') ?? '').trim();
    const senha = String(this.input('password', '') ?? '');
    await User.validarUsername(username);
    const err = senha_fraca(senha);
    if (err) throw new HttpException(400, err);
    if (senha !== String(this.input('confirmacao', senha) ?? '')) throw new HttpException(400, 'As senhas não conferem');
    if (empty(this.input('aceite_termos'))) throw new HttpException(400, 'Para continuar, aceite o Termo de uso e a Política de privacidade');
    const perfilAdmin = int(await Database.value('SELECT id FROM perfis WHERE is_admin=1 ORDER BY sistema DESC, id LIMIT 1'));
    const id = await User.create({
      username, nome: cut(str_or_null(this.input('nome')), 150), password: User.hash(senha),
      role: 'admin', perfil_id: perfilAdmin || null, senha_alterada_em: agora(),
      termos_versao: Termos.VERSAO, termos_aceitos_em: agora(),
    });
    const u = await User.find(id);
    await User.registrarLogin(id, client_ip());
    await Auth.login(u, false);
    await this.log('setup_admin', 'auth', id, `Primeiro administrador criado: ${username}`);
    await this.log('aceite_termos', 'auth', id, 'Termo de uso e Política de privacidade v' + Termos.VERSAO);
    return { ...Auth.out(), csrf: Csrf.token() };
  }

  async login() {
    // Por IP: 15 senhas erradas em 10 min bloqueiam este computador (acertos não contam).
    await RateLimit.checar('login', 15, 600);
    const username = String(this.input('username', '') ?? '').trim();
    const senha = String(this.input('password', '') ?? '');
    if (username === '' || senha === '') throw new HttpException(400, 'Informe usuário e senha');

    let u = await User.porUsername(username);
    const ate = u ? User.bloqueadoAte(u) : null;
    if (u && ate) {
      throw new HttpException(423, 'Muitas tentativas erradas para este usuário. Aguarde ' + RateLimit.tempo(ate - time()) + ' ou peça para um administrador desbloquear.', 'BLOQUEADO');
    }
    const ok = User.verificar(senha, u ? u.password : HASH_FALSO);
    if (!u || !ok) {
      await RateLimit.contar('login', 600);
      if (u) {
        const restam = await User.registrarFalha(u);
        await this.log('login_failed', 'auth', u.id, 'Senha incorreta' + (restam === 0 ? ' — usuário bloqueado por ' + User.MINUTOS_BLOQUEIO + ' min' : ''), username);
        if (restam === 0) throw new HttpException(423, 'Muitas tentativas erradas. Este usuário ficou bloqueado por ' + User.MINUTOS_BLOQUEIO + ' minutos.', 'BLOQUEADO');
      } else {
        await this.log('login_failed', 'auth', null, `Usuário inexistente: ${username}`, mb_substr(username, 0, 100));
      }
      throw new HttpException(401, 'Usuário ou senha incorretos');
    }
    if (!int(u.ativo)) {
      await this.log('login_failed', 'auth', u.id, 'Acesso desativado', username);
      throw new HttpException(403, 'Este acesso está desativado. Fale com um administrador.', 'DESATIVADO');
    }
    await User.registrarLogin(int(u.id), client_ip());
    u = await User.find(int(u.id));
    const lembrar = !empty(this.input('lembrar', false));
    await Auth.login(u, lembrar);
    await this.log('login', 'auth', u.id, lembrar ? 'Manter conectado' : null);
    return { ...Auth.out(), csrf: Csrf.token() };
  }

  async logout() {
    const u = await Auth.user();
    if (u) await this.log('logout', 'auth', u.id);
    await Auth.logout();
    return { ok: true };
  }

  async me() {
    await Auth.exigir();
    return { ...Auth.out(), csrf: Csrf.token() };
  }

  /** Troca a própria senha. Obrigatória no primeiro acesso com senha provisória. */
  async trocarSenha() {
    const u = await Auth.exigir();
    const atual = String(this.input('senha_atual', '') ?? '');
    const nova = String(this.input('nova', '') ?? '');
    const conf = String(this.input('confirmacao', '') ?? '');
    const full = await User.find(int(u.id));
    if (!int(u.deve_trocar_senha) || atual !== '') {
      // Fora da troca obrigatória pede a senha atual (quem pegou o computador destravado não troca).
      if (!User.verificar(atual, full.password)) throw new HttpException(400, 'Senha atual incorreta');
    }
    const err = senha_fraca(nova);
    if (err) throw new HttpException(400, err);
    if (nova !== conf) throw new HttpException(400, 'A confirmação não confere com a nova senha');
    if (User.verificar(nova, full.password)) throw new HttpException(400, 'A nova senha precisa ser diferente da atual');
    await User.definirSenha(int(u.id), nova, false);
    await Auth.reassinar();
    await this.log('update', 'users', u.id, 'Trocou a própria senha');
    return { ...Auth.out(await User.comPerfil(int(u.id))), csrf: Csrf.token() };
  }

  // ─── LGPD: aceite do Termo de uso e da Política de privacidade ─────────
  async aceitarTermos() {
    const u = await Auth.exigir();
    if (empty(this.input('aceite'))) throw new HttpException(400, 'Marque que você leu e concorda para continuar');
    await User.update(int(u.id), { termos_versao: Termos.VERSAO, termos_aceitos_em: agora() });
    await this.log('aceite_termos', 'auth', u.id, 'Termo de uso e Política de privacidade v' + Termos.VERSAO);
    const novo = await User.comPerfil(int(u.id));
    require('../../core/Context').ctx().user = novo;
    return { ...Auth.out(novo), csrf: Csrf.token() };
  }

  /** Edita o PRÓPRIO perfil (nome, e-mail, foto, dados profissionais). */
  async perfil() {
    const u = await Auth.exigir();
    const atual = await User.find(int(u.id));
    const email = str_or_null(this.input('email'));
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    const fone = (campo, rotulo) => {
      const d = only_digits(String(this.input(campo, '') ?? ''));
      if (d === '') return null;
      if (d.length < 10 || d.length > 11) throw new HttpException(400, `${rotulo} inválido: use DDD + número (10 ou 11 dígitos)`);
      return d;
    };
    const ramal = only_digits(String(this.input('ramal', '') ?? ''));
    if (ramal.length > 6) throw new HttpException(400, 'Ramal: até 6 números');
    const dados = {
      nome: cut(str_or_null(this.input('nome')), 150), email: cut(email, 150),
      cargo: cut(str_or_null(this.input('cargo')), 100), setor: cut(str_or_null(this.input('setor')), 100),
      telefone: fone('telefone', 'Telefone comercial'), ramal: ramal !== '' ? ramal : null,
      whatsapp: fone('whatsapp', 'WhatsApp comercial'),
    };
    const foto = Upload.salvar('foto', 'perfil', Upload.IMAGEM, 8 * 1024 * 1024);
    if (foto) {
      Upload.apagar(atual.foto_path);
      dados.foto_path = foto.path; dados.foto_nome = foto.nome;
    } else if (this.input('remover_foto') === '1') {
      Upload.apagar(atual.foto_path);
      dados.foto_path = null; dados.foto_nome = null;
    }
    await User.update(int(u.id), dados);
    await this.log('update', 'users', u.id, 'Atualizou o próprio perfil');
    return Auth.out(await User.comPerfil(int(u.id)));
  }
}

module.exports = AuthController;
