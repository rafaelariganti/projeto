const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { public_path, agora, strtotime, time, int } = require('../helpers');

const SELECT_PERFIL = `SELECT u.*, p.nome AS perfil_nome, p.is_admin AS perfil_admin, p.permissoes AS perfil_permissoes
                       FROM users u LEFT JOIN perfis p ON p.id = u.perfil_id`;

class User extends Model {
  static table = 'users';

  static USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
  static MAX_TENTATIVAS = 5;     // erros seguidos de senha antes de bloquear
  static MINUTOS_BLOQUEIO = 15;

  /** Usuário + dados do nível de acesso. is_admin vem do perfil (ou do role antigo se ficou sem perfil). */
  static async comPerfil(id) {
    const u = await Database.one(SELECT_PERFIL + ' WHERE u.id=?', [id]);
    return u ? User.montar(u) : null;
  }

  static async porUsername(username) {
    const u = await Database.one(SELECT_PERFIL + ' WHERE u.username=?', [username]);
    return u ? User.montar(u) : null;
  }

  static montar(u) {
    u.is_admin = u.perfil_id !== null && u.perfil_admin !== null ? int(u.perfil_admin) : (u.role === 'admin' ? 1 : 0);
    return u;
  }

  /** Lista pra tela de Usuários (sem o hash da senha). */
  static async listar() {
    const rows = await Database.all(`SELECT u.id, u.username, u.nome, u.email, u.role, u.perfil_id, u.ativo, u.deve_trocar_senha, u.tentativas_falhas,
          u.bloqueado_ate, u.ultimo_login, u.ultimo_ip, u.foto_path, u.created_at, u.cargo, u.setor,
          p.nome AS perfil_nome, p.is_admin AS perfil_admin
        FROM users u LEFT JOIN perfis p ON p.id=u.perfil_id ORDER BY u.ativo DESC, u.nome, u.username`);
    const ag = agora();
    return rows.map((u) => ({
      ...u,
      id: int(u.id), perfil_id: u.perfil_id !== null ? int(u.perfil_id) : null,
      ativo: int(u.ativo), deve_trocar_senha: int(u.deve_trocar_senha),
      is_admin: int(u.perfil_admin ?? (u.role === 'admin' ? 1 : 0)),
      bloqueado: !!u.bloqueado_ate && u.bloqueado_ate > ag,
      foto_path: public_path(u.foto_path),
    }));
  }

  static async validarUsername(username, ignorarId = null) {
    if (!User.USERNAME_RE.test(String(username))) throw new HttpException(400, 'Usuário deve ter 3 a 32 caracteres (letras, números, _ . -)');
    const dup = ignorarId
      ? await Database.one('SELECT id FROM users WHERE username=? AND id<>?', [username, ignorarId])
      : await Database.one('SELECT id FROM users WHERE username=?', [username]);
    if (dup) throw new HttpException(400, 'Esse usuário já existe');
  }

  /** Quantos administradores ATIVOS sobram tirando `exceto`. */
  static async adminsRestantes(exceto) {
    return int(await Database.value(`SELECT COUNT(*) FROM users u JOIN perfis p ON p.id=u.perfil_id
        WHERE p.is_admin=1 AND u.ativo=1 AND u.id<>?`, [exceto]));
  }

  // ─── Senha (bcrypt — compatível com os hashes $2y$ gerados pela versão PHP) ───
  static hash(senha) { return bcrypt.hashSync(String(senha), 10); }

  static verificar(senha, hash) {
    if (!hash) return false;
    try { return bcrypt.compareSync(String(senha), String(hash).replace(/^\$2y\$/, '$2b$')); } catch { return false; }
  }

  // ─── Login ──────────────────────────────────────────────────────────────
  static bloqueadoAte(u) {
    if (!u.bloqueado_ate) return null;
    const t = strtotime(String(u.bloqueado_ate));
    return t > time() ? t : null;
  }

  /** Conta um erro de senha; bloqueia ao chegar no limite. Devolve tentativas restantes. */
  static async registrarFalha(u) {
    const n = int(u.tentativas_falhas) + 1;
    if (n >= User.MAX_TENTATIVAS) {
      await Database.run('UPDATE users SET tentativas_falhas=0, bloqueado_ate=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?', [User.MINUTOS_BLOQUEIO, u.id]);
      return 0;
    }
    await Database.run('UPDATE users SET tentativas_falhas=? WHERE id=?', [n, u.id]);
    return User.MAX_TENTATIVAS - n;
  }

  static async registrarLogin(id, ip) {
    await Database.run('UPDATE users SET tentativas_falhas=0, bloqueado_ate=NULL, ultimo_login=NOW(), ultimo_ip=? WHERE id=?', [ip, id]);
  }

  static async desbloquear(id) {
    await Database.run('UPDATE users SET tentativas_falhas=0, bloqueado_ate=NULL WHERE id=?', [id]);
  }

  static async definirSenha(id, senha, trocarNoProximoLogin) {
    await Database.run('UPDATE users SET password=?, deve_trocar_senha=?, senha_alterada_em=NOW(), tentativas_falhas=0, bloqueado_ate=NULL WHERE id=?',
      [User.hash(senha), trocarNoProximoLogin ? 1 : 0, id]);
  }

  /** Senha provisória legível (sem 0/O/1/l pra não confundir ao ditar). */
  static senhaProvisoria() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
    const nums = '23456789';
    const s = [];
    for (let i = 0; i < 6; i++) s.push(letras[crypto.randomInt(letras.length)]);
    for (let i = 0; i < 4; i++) s.push(nums[crypto.randomInt(nums.length)]);
    for (let i = s.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [s[i], s[j]] = [s[j], s[i]]; }
    return s.join('');
  }
}

module.exports = User;
