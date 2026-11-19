/**
 * Renderiza uma view EJS (src/views/...) dentro de um layout.
 * Dentro da view as chaves de data viram variáveis; `content` no layout é o HTML da view.
 * Os helpers (e, url, asset...) e o Auth ficam disponíveis em toda view.
 */
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');
const config = require('../bootstrap');
const { ctx } = require('./Context');
const { Encerrar } = require('./HttpException');

function globais() {
  return {
    ...require('../helpers'),
    Auth: require('./Auth'),
    Permissions: require('./Permissions'),
    Termos: require('./Termos'),
    Csrf: require('./Csrf'),
    APP_VERSION: config.APP_VERSION,
    IS_PROD: config.IS_PROD,
    /** JSON seguro dentro de <script> (equivale ao JSON_HEX_TAG | JSON_HEX_AMP do PHP). */
    json: (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026'),
  };
}

function arquivo(view) {
  const file = path.join(config.VIEWS_DIR, view + '.ejs');
  if (!fs.existsSync(file)) throw new Error('View não encontrada: ' + view);
  return file;
}

/** HTML de uma view (sem layout). Dentro das views use partial('partials/x', {...}). */
function partial(view, data = {}) {
  const locals = { ...globais(), ...data };
  locals.partial = (v, d = {}) => partial(v, { ...data, ...d });
  return ejs.render(fs.readFileSync(arquivo(view), 'utf8'), locals, { filename: arquivo(view), cache: config.IS_PROD, async: false });
}

function render(view, data = {}, layout = 'layouts/app') {
  let content = partial(view, data);
  if (layout) content = partial(layout, { ...data, content });
  const res = ctx().res;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(content);
  throw new Encerrar();
}

module.exports = { render, partial };
