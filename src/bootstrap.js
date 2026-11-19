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

// DATABASE_URL (mysql://usuario:senha@host:porta/banco?ssl=true), comum em Vercel/Railway/Aiven,
// vira DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME e DB_SSL (as variáveis separadas têm prioridade).
(function lerDatabaseUrl() {
  const u = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (!u) return;
  try {
    const url = new URL(u);
    const def = (k, v) => { if ((process.env[k] === undefined || process.env[k] === '') && v) process.env[k] = v; };
    def('DB_HOST', url.hostname);
    def('DB_PORT', url.port || '3306');
    def('DB_USER', decodeURIComponent(url.username));
    def('DB_PASS', decodeURIComponent(url.password));
    def('DB_NAME', decodeURIComponent(url.pathname.replace(/^\//, '')));
    const ssl = url.searchParams.get('ssl') || url.searchParams.get('ssl-mode') || url.searchParams.get('sslmode');
    if (ssl && !/^(false|0|disabled?)$/i.test(ssl)) def('DB_SSL', '1');
  } catch { /* URL inválida: usa as variáveis separadas */ }
})();

process.env.TZ = process.env.APP_TZ || 'America/Sao_Paulo';

const config = {
  ROOT_DIR,
  APP_DIR,
  VIEWS_DIR: path.join(APP_DIR, 'views'),
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  STORAGE_DIR: path.join(ROOT_DIR, 'storage'),
  // Versão do sistema — aparece na tela de login. Atualize a cada entrega.
  APP_VERSION: '4.1.0',
};
config.IS_PROD = (process.env.APP_ENV || 'production') === 'production';
/** Rodando como função serverless da Vercel (sem disco permanente, sem processo sempre ligado). */
config.SERVERLESS = !!process.env.VERCEL;

module.exports = config;
