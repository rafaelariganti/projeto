/**
 * Usuário logado + permissões. O usuário é relido do banco a cada requisição
 * (não confia só na sessão), então trocar o nível de acesso, desativar ou
 * redefinir a senha de alguém vale na hora — a sessão antiga cai sozinha.
 *
 * user() é assíncrono (vai ao banco) e o App chama logo no começo de toda requisição;
 * depois disso isAdmin(), pode(), nivel() etc. leem o usuário já carregado (síncronos).
 */
const crypto = require('crypto');
const { ctx } = require('./Context');
const Session = require('./Session');
const Csrf = require('./Csrf');
const Permissions = require('./Permissions');
const Termos = require('./Termos');
const { HttpException } = require('./HttpException');
const { int, public_path } = require('../helpers');

const User = () => require('../models/User');

/** Assinatura que muda quando a senha ou a situação do usuário muda. */
function assinatura(u) {
  return crypto.createHash('sha256').update(String(u.password) + '|' + int(u.ativo ?? 1)).digest('hex').slice(0, 24);
}

async function user() {
  const c = ctx();
  if (!c) return null;
  if (c.authCarregado) return c.user || null;
  c.authCarregado = true;
  c.user = null;
  if (require('../bootstrap').DEMO) {
    const Demo = require('../demo/Demo');
    c.user = Demo.logado() ? Demo.usuario() : null;
    return c.user;
  }
  const id = int(Session.get('uid') ?? 0);
  if (!id) return null;
  if (Session.expirada()) { await Session.destroy(); return null; }
  const u = await User().comPerfil(id);
  if (!u || !int(u.ativo) || (Session.get('sig') ?? '') !== assinatura(u)) {
    await Session.destroy();
    return null;
  }
  Session.touch();
  c.user = u;
  return u;
}

/** Usuário já carregado nesta requisição (síncrono). */
function atual() { const c = ctx(); return c && c.user ? c.user : null; }

async function check() { return (await user()) !== null; }

/** Exige login; 401 se não tiver. */
async function exigir() {
  const u = await user();
  if (!u) throw new HttpException(401, 'Não autenticado');
  return u;
}

async function login(u, remember) {
  await Session.regenerate(remember);
  Session.set('uid', int(u.id));
  Session.set('sig', assinatura(u));
  Csrf.renovar();
  const c = ctx();
  c.user = await User().comPerfil(int(u.id));
  c.authCarregado = true;
}

/** Depois de trocar a própria senha a assinatura muda — atualiza pra não se deslogar. */
async function reassinar() {
  const u = await User().find(int(Session.get('uid') ?? 0));
  if (u) Session.set('sig', assinatura(u));
  const c = ctx();
  c.authCarregado = false;
  await user();
}

async function logout() {
  await Session.destroy();
  const c = ctx();
  c.user = null;
  c.authCarregado = true;
}

function isAdmin() {
  const u = atual();
  return !!u && int(u.is_admin ?? 0) === 1;
}

/** Nível do usuário logado na tela: 0 nada, 1 ver, 2 editar. */
function nivel(tela) {
  if (isAdmin()) return Permissions.EDITAR;
  const u = atual();
  return u ? int(permissoes()[tela] ?? 0) : 0;
}

function permissoes() {
  const u = atual();
  if (!u) return {};
  if (int(u.is_admin ?? 0) === 1) return Permissions.todas();
  return Permissions.normalizar(u.perfil_permissoes ?? '[]');
}

/** Pode VER pelo menos uma das telas. */
function pode(...telas) {
  for (const t of telas) if (nivel(t) >= Permissions.VER) return true;
  return false;
}

function podeEditar(tela) { return nivel(tela) >= Permissions.EDITAR; }

/** Primeira tela liberada — destino depois do login e da logo do menu. */
function home() {
  for (const [k, t] of Object.entries(Permissions.TELAS)) if (nivel(k) >= Permissions.VER) return t[2];
  return isAdmin() ? 'usuarios' : 'sem-acesso';
}

/** Formato enviado pro front. */
function out(u = null) {
  u = u ?? atual();
  const admin = int(u.is_admin ?? 0) === 1;
  return {
    id: int(u.id), username: u.username, nome: u.nome ?? null,
    email: u.email ?? null,
    cargo: u.cargo ?? null, setor: u.setor ?? null,
    telefone: u.telefone ?? null, ramal: u.ramal ?? null, whatsapp: u.whatsapp ?? null,
    senha_alterada_em: u.senha_alterada_em ?? null,
    foto_path: public_path(u.foto_path ?? null),
    perfil_id: u.perfil_id !== null && u.perfil_id !== undefined ? int(u.perfil_id) : null,
    perfil_nome: u.perfil_nome ?? (admin ? 'Administrador' : 'Sem nível'),
    role: admin ? 'admin' : 'user', is_admin: admin,
    permissoes: admin ? Permissions.todas() : Permissions.normalizar(u.perfil_permissoes ?? '[]'),
    deve_trocar_senha: int(u.deve_trocar_senha ?? 0) === 1,
    deve_aceitar_termos: Termos.pendente(u),
    termos_aceitos_em: u.termos_aceitos_em ?? null, termos_versao: u.termos_versao ?? null,
    home: home(),
  };
}

module.exports = { assinatura, user, atual, check, require: exigir, exigir, login, reassinar, logout, isAdmin, nivel, permissoes, pode, podeEditar, home, out };
