/**
 * bootstrap.js — prepara a aplicação: constantes, .env e fuso horário.
 * Quem carrega é o server.js e os scripts de linha de comando (migrate, testes).
 */
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const APP_DIR = __dirname;

// ─── .env simples (sem dependência) ──────────────────────────────────────────
(function carregarEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  for (let line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (line === '' || line[0] === '#' || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    if (process.env[k] === undefined) process.env[k] = v;
  }
})();

process.env.TZ = process.env.APP_TZ || 'America/Sao_Paulo';

const config = {
  ROOT_DIR,
  APP_DIR,
  VIEWS_DIR: path.join(APP_DIR, 'views'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  STORAGE_DIR: path.join(ROOT_DIR, 'storage'),
  // Versão do sistema — aparece na tela de login. Atualize a cada entrega.
  APP_VERSION: '4.0.0',
};
config.IS_PROD = (process.env.APP_ENV || 'production') === 'production';

module.exports = config;
