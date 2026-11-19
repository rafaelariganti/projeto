/**
 * Sessão (express-session, gravada no MySQL) com cookie httpOnly + SameSite=Strict (+ Secure em HTTPS).
 * Sem "lembrar de mim" o cookie morre ao fechar o navegador e a sessão expira
 * após IDLE segundos sem uso; com "lembrar" o cookie dura REMEMBER segundos.
 */
const { ctx } = require('./Context');
const { time } = require('../helpers');

const IDLE = 8 * 3600;        // 8h parado → pede login de novo
const REMEMBER = 30 * 86400;  // "Manter conectado" por 30 dias

function req() { return ctx().req; }
function sess() { return req().session; }

function https() { return !!req().secure; }

/** Novo id de sessão (evita fixação) e cookie com a validade certa. */
function regenerate(remember) {
  return new Promise((resolve, reject) => {
    req().session.regenerate((err) => {
      if (err) return reject(err);
      const s = req().session;
      s.remember = !!remember;
      s.last = time();
      s.cookie.maxAge = remember ? REMEMBER * 1000 : null;
      resolve();
    });
  });
}

function destroy() {
  return new Promise((resolve) => {
    const r = req();
    const c = ctx();
    if (!r.session) return resolve();
    r.session.destroy(() => {
      c.res.clearCookie('dre_sess', { path: require('../helpers').base_path(), httpOnly: true, sameSite: 'strict', secure: https() });
      resolve();
    });
  });
}

/** Sessão sem "lembrar" que ficou parada demais. */
function expirada() {
  const s = sess();
  const last = Number(s?.last || 0);
  return !s?.remember && last && time() - last > IDLE;
}

function touch() {
  // Grava no máximo 1x por minuto pra não reescrever a sessão a cada requisição.
  const s = sess();
  if (time() - Number(s.last || 0) > 60) s.last = time();
}

function get(k) { return sess() ? sess()[k] : undefined; }
function set(k, v) { sess()[k] = v; }

/** Grava a sessão agora (antes de responder). */
function save() {
  return new Promise((resolve) => { const s = sess(); if (!s) return resolve(); s.save(() => resolve()); });
}

module.exports = { IDLE, REMEMBER, https, regenerate, destroy, expirada, touch, get, set, save };
