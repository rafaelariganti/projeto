/** Leitura da requisição atual (método, caminho, corpo JSON/form, query, arquivos). */
const { ctx } = require('./Context');
const { base_path } = require('../helpers');

function req() { return ctx().req; }

function method() { return String(req().method || 'GET').toUpperCase(); }

/** Caminho sem a pasta base, sem barras nas pontas. Ex: "api/transactions/5". */
function path() {
  const c = ctx();
  if (c.path !== undefined) return c.path;
  let uri = String(req().path || '/');
  try { uri = decodeURIComponent(uri); } catch { /* mantém */ }
  const base = base_path();
  if (base !== '/' && uri.startsWith(base)) uri = uri.slice(base.length);
  else if (base !== '/' && uri.replace(/\/+$/, '') === base.replace(/\/+$/, '')) uri = '';
  uri = uri.replace(/^\/+/, '').replace(/^index\.php\/?/, '');
  c.path = uri.replace(/^\/+|\/+$/g, '');
  return c.path;
}

function isApi() { const p = path(); return p.startsWith('api/') || p === 'api'; }

/** Corpo: JSON (fetch do front) ou form-data (uploads). */
function body() {
  const b = req().body;
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}

function has(k) { return Object.prototype.hasOwnProperty.call(body(), k); }

function input(k, def = null) {
  const b = body();
  return Object.prototype.hasOwnProperty.call(b, k) ? b[k] : def;
}

/** Primeiro valor não-vazio entre várias chaves (o front manda nomes antigos e novos). */
function first(keys, def = '') {
  for (const k of keys) { const v = input(k); if (v !== null && v !== undefined && v !== '') return v; }
  return def;
}

function query(k, def = null) {
  const q = req().query || {};
  const v = q[k];
  return v !== undefined && v !== '' ? v : def;
}

function header(name) {
  const v = req().headers[String(name).toLowerCase()];
  return v === undefined ? null : String(v);
}

/**
 * Arquivos enviados (multipart), no formato do $_FILES do PHP:
 * { name, type, tmp_name, error, size }. Campo "arquivos[]" vira lista.
 */
function files() {
  const c = ctx();
  if (c.files) return c.files;
  const out = {};
  for (const f of req().files || []) {
    const item = { name: f.originalname, type: f.mimetype, tmp_name: f.path, error: 0, size: f.size };
    const multi = f.fieldname.endsWith('[]');
    const k = multi ? f.fieldname.slice(0, -2) : f.fieldname;
    if (multi) (out[k] = Array.isArray(out[k]) ? out[k] : []).push(item);
    else out[k] = item;
  }
  c.files = out;
  return out;
}

function file(campo) { return files()[campo] || null; }

module.exports = { method, path, isApi, body, has, input, first, query, header, files, file };
