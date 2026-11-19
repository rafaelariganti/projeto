/** Saídas HTTP: JSON, download, redirecionamento. Todas encerram a requisição. */
const { ctx } = require('./Context');
const { Encerrar } = require('./HttpException');
const { url } = require('../helpers');
const config = require('../bootstrap');

function res() { return ctx().res; }

function json(data, status = 200) {
  const r = res();
  if (!r.headersSent) {
    r.status(status);
    r.setHeader('Content-Type', 'application/json; charset=utf-8');
    r.end(JSON.stringify(data ?? null));
  }
  throw new Encerrar();
}

function download(content, mime, filename) {
  const r = res();
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  r.setHeader('Content-Type', mime);
  r.setHeader('Content-Disposition', `attachment; filename="${String(filename).replace(/"/g, '')}"`);
  r.setHeader('Content-Length', buf.length);
  r.end(buf);
  throw new Encerrar();
}

function redirect(p) {
  const r = res();
  r.status(302);
  r.setHeader('Location', /^https?:\/\//.test(p) ? p : url(p));
  r.end();
  throw new Encerrar();
}

function header(nome, valor) { res().setHeader(nome, valor); }
function status(s) { res().status(s); }

function securityHeaders() {
  const r = res();
  const req = ctx().req;
  r.setHeader('X-Content-Type-Options', 'nosniff');
  r.setHeader('X-Frame-Options', 'DENY');
  r.setHeader('Referrer-Policy', 'same-origin');
  r.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  if (config.IS_PROD && req.secure) r.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
}

module.exports = { json, download, redirect, header, status, securityHeaders };
