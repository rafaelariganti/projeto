/**
 * Token anti-CSRF por sessão. As views colocam o token numa <meta> e o front
 * manda no cabeçalho X-CSRF-Token em todo POST/PUT/PATCH/DELETE.
 * (O cookie SameSite=Strict já barra a maioria dos ataques; isso é a segunda camada.)
 */
const crypto = require('crypto');
const Session = require('./Session');
const Request = require('./Request');
const { HttpException } = require('./HttpException');
const { hash_equals } = require('../helpers');

function token() {
  if (!Session.get('csrf')) Session.set('csrf', crypto.randomBytes(32).toString('hex'));
  return Session.get('csrf');
}

function renovar() {
  Session.set('csrf', crypto.randomBytes(32).toString('hex'));
  return Session.get('csrf');
}

function verificar() {
  const enviado = String(Request.header('X-CSRF-Token') ?? Request.input('_csrf', '') ?? '');
  const atual = Session.get('csrf');
  if (enviado === '' || !atual || !hash_equals(atual, enviado)) {
    throw new HttpException(403, 'Sessão desatualizada. Recarregue a página e tente de novo.', 'CSRF');
  }
}

module.exports = { token, renovar, verificar };
