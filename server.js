/**
 * server.js — ponto de entrada (equivale ao index.php + .htaccess da versão PHP).
 *   npm start            → sobe o servidor (PORT do .env, padrão 3000)
 *
 * Arquivo estático (assets/, uploads/) é servido direto; todo o resto
 * (páginas e /api/*) vai pro App, que faz o papel do front controller.
 */
const config = require('./src/bootstrap');
const path = require('path');
const os = require('os');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const multer = require('multer');
const qs = require('qs');
const { env, base_path, origem_confiavel } = require('./src/helpers');
const Context = require('./src/core/Context');
const App = require('./src/core/App');
const Session = require('./src/core/Session');
const Logger = require('./src/core/Logger');

const app = express();
app.disable('x-powered-by');
app.set('etag', false);
if (env('TRUST_PROXY') === '1') app.set('trust proxy', true);

const BASE = base_path();

// API Gateway (AWS) manda X-Origin-Proto: https junto com o segredo de origem.
app.use((req, res, next) => {
  if (env('TRUST_PROXY') === '1' && req.headers['x-origin-proto'] === 'https') {
    Context.run({ req, res }, () => { if (origem_confiavel()) req.headers['x-forwarded-proto'] = 'https'; });
  }
  next();
});

// ─── Bloqueios (mesmos do .htaccess) ─────────────────────────────────────────
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch { /* mantém */ }
  if (BASE !== '/' && p.startsWith(BASE)) p = '/' + p.slice(BASE.length);
  if (/^\/(src|storage|docs|infra|scripts|tests|docker|node_modules)(\/|$)|\/\.|\.(sql|md|lock|log|env)$|^\/(server|package)(-lock)?\.js(on)?$/.test(p)) return res.status(403).send('Forbidden');
  if (/^\/uploads\/.*\.(php\d?|phtml|phar|html?|svg|js)$/i.test(p)) return res.status(403).send('Forbidden');
  next();
});

// ─── Estáticos ───────────────────────────────────────────────────────────────
const estatico = { index: false, dotfiles: 'deny', fallthrough: true, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') };
app.use(BASE + 'assets', express.static(path.join(config.ROOT_DIR, 'assets'), { ...estatico, maxAge: config.IS_PROD ? '30d' : 0 }));
app.use(BASE + 'uploads', express.static(config.UPLOADS_DIR, estatico));

// ─── Sessão (gravada no MySQL: funciona com várias instâncias atrás do balanceador) ───
// A tabela `sessions` é criada pelo Migrator (o store só lê e grava nela).
const store = new MySQLStore({
  host: env('DB_HOST', 'localhost'), port: Number(env('DB_PORT', 3306)),
  user: env('DB_USER', 'root'), password: env('DB_PASS', ''), database: env('DB_NAME', 'dre_oaf'),
  createDatabaseTable: false, clearExpired: true, checkExpirationInterval: 15 * 60 * 1000,
  expiration: Session.REMEMBER * 1000,
  schema: { tableName: 'sessions', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
});

let segredo = env('SESSION_SECRET', '');
if (!segredo) {
  // Sem SESSION_SECRET no .env: gera um e guarda em storage/ (sobrevive a reinícios).
  const arq = path.join(config.STORAGE_DIR, 'session_secret');
  try { segredo = fs.readFileSync(arq, 'utf8').trim(); } catch { /* não existe */ }
  if (!segredo) { segredo = require('crypto').randomBytes(32).toString('hex'); try { fs.writeFileSync(arq, segredo, { mode: 0o600 }); } catch { /* sem permissão */ } }
}

const middlewareSessao = session({
  name: 'dre_sess',
  secret: segredo,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: false,
  proxy: env('TRUST_PROXY') === '1',
  cookie: { path: BASE, httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: null },
});
app.use((req, res, next) => {
  // /health não cria sessão nem toca no banco de sessões.
  if (req.path === BASE + 'health') return next();
  middlewareSessao(req, res, (err) => {
    // Banco fora do ar: segue sem sessão (a tela mostra a mensagem de conexão em vez de um erro genérico).
    if (err) Logger.error('Falha ao ler a sessão', { erro: err.message });
    next();
  });
});

// ─── Corpo da requisição ─────────────────────────────────────────────────────
const MAX_UPLOAD = Number(env('UPLOAD_MAX_MB', 22)) * 1024 * 1024;
app.use(express.json({ limit: '25mb', type: ['application/json', 'application/*+json'] }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
const upload = multer({ dest: path.join(os.tmpdir(), 'dre-uploads'), limits: { fileSize: MAX_UPLOAD, files: 200 } }).any();
app.use((req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande' : 'Falha no upload do arquivo';
      return res.status(400).json({ error: msg });
    }
    // Campos "a[b]" do form-data viram objeto, igual ao $_POST do PHP.
    req.body = qs.parse(new URLSearchParams(Object.entries(req.body || {}).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString());
    // Arquivos temporários somem quando a resposta termina.
    res.on('finish', () => { for (const f of req.files || []) fs.unlink(f.path, () => {}); });
    next();
  });
});
app.use((err, req, res, next) => {
  // JSON malformado etc.
  if (err && err.type === 'entity.parse.failed') { req.body = {}; return next(); }
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Requisição muito grande' });
  next(err);
});

// ─── Front controller ────────────────────────────────────────────────────────
app.use((req, res) => {
  Context.run({ req, res }, async () => {
    try {
      await App.run();
    } catch (e) {
      if (!e || !e.encerrar) {
        Logger.error('Falha fora do App', { erro: e?.message });
        if (!res.headersSent) res.status(500).send('Erro interno');
      }
    }
  });
});

const PORT = Number(env('PORT', 3000));

/** Cria o banco/tabelas (se precisar) antes de aceitar requisições. */
async function iniciar() {
  try {
    await require('./src/database/Migrator').garantir();
  } catch (e) {
    // Sem banco o site ainda sobe: as telas mostram a mensagem de conexão e o /health fica DOWN.
    Logger.error('Não foi possível preparar o banco na inicialização', { erro: e.message });
  }
  return app.listen(PORT, () => Logger.info(`DRE System ${config.APP_VERSION} rodando em http://localhost:${PORT}${BASE}`));
}

if (require.main === module) iniciar();

module.exports = { app, iniciar };
