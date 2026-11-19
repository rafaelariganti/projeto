/**
 * App — chamado pelo server.js em toda requisição que não é arquivo estático.
 * Monta as rotas, aplica as travas globais (CSRF, troca de senha pendente, termos),
 * chama o controller e trata os erros.
 */
const config = require('../bootstrap');
const Request = require('./Request');
const Response = require('./Response');
const Router = require('./Router');
const Csrf = require('./Csrf');
const Auth = require('./Auth');
const Termos = require('./Termos');
const Logger = require('./Logger');
const View = require('./View');
const { HttpException, Encerrar } = require('./HttpException');
const { origem_confiavel, int } = require('../helpers');

/** Rotas da API que aceitam POST sem token CSRF (ainda não existe sessão). */
const SEM_CSRF = ['api/auth/login', 'api/auth/register'];

/** Com troca de senha pendente, só estas rotas funcionam. */
const DURANTE_TROCA = ['api/auth/me', 'api/auth/trocar-senha', 'api/auth/logout', 'api/auth/setup-status', 'login', 'sair', 'privacidade', 'termos'];

/** Sem aceite do Termo/Política (LGPD), só estas rotas funcionam. */
const DURANTE_TERMOS = ['api/auth/me', 'api/auth/aceitar-termos', 'api/auth/logout', 'api/auth/setup-status', 'login', 'sair', 'privacidade', 'termos'];

let router = null;
function rotas() {
  if (router) return router;
  router = new Router();
  require('../routes')(router);
  return router;
}

/** Códigos de erro do MySQL que significam "não conectou". */
const ERROS_CONEXAO = [1045, 2002, 2003, 2005, 1044];
const CODIGOS_CONEXAO = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'PROTOCOL_CONNECTION_LOST'];

function erroDeBanco(e) { return !!(e && (e.sqlState || e.errno || CODIGOS_CONEXAO.includes(e.code)) && (e.sqlMessage !== undefined || CODIGOS_CONEXAO.includes(e.code))); }

async function paginaErro(status, msg) {
  Response.status(status);
  View.render('errors/erro', { status, mensagem: msg, titulo: 'Erro ' + status }, 'layouts/auth');
}

async function run() {
  Response.securityHeaders();
  const method = Request.method();
  const path = Request.path();
  const api = Request.isApi();
  if (api) Response.header('Cache-Control', 'no-store');

  // Health check antes de migração/sessão: responde rápido e não cria sessão.
  if (path === 'health' && method === 'GET') return require('../controllers/HealthController').check();

  // Na AWS só o API Gateway conhece o ORIGIN_SECRET: quem tentar o IP da EC2 direto leva 403.
  if (!origem_confiavel()) {
    Logger.warn('Acesso direto à origem bloqueado (sem X-Origin-Verify)');
    if (api) Response.json({ error: 'Acesso negado' }, 403);
    Response.status(403);
    require('./Context').ctx().res.end('Forbidden');
    throw new Encerrar();
  }

  try {
    await require('../database/Migrator').garantir();
    const r = rotas();

    if (api && method !== 'GET' && !SEM_CSRF.includes(path)) Csrf.verificar();

    const u = await Auth.user();
    if (u && int(u.deve_trocar_senha) === 1 && !DURANTE_TROCA.includes(path)) {
      if (api) throw new HttpException(403, 'Defina uma nova senha para continuar', 'TROCAR_SENHA');
      Response.redirect('login');
    }
    if (u && int(u.deve_trocar_senha) !== 1 && Termos.pendente(u) && !DURANTE_TERMOS.includes(path)) {
      if (api) throw new HttpException(403, 'Aceite o Termo de uso e a Política de privacidade para continuar', 'ACEITAR_TERMOS');
      Response.redirect('login' + (path !== '' ? '?next=' + encodeURIComponent(path) : ''));
    }

    const [action, params] = r.match(method, path);
    if (!action) throw new HttpException(404, api ? 'Rota não encontrada' : 'Página não encontrada');
    const result = await r.dispatch(action, params);
    if (api) Response.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof Encerrar) throw e;
    if (e instanceof HttpException) {
      if (e.status >= 500) Logger.error(e.message, { status: e.status });
      else if ([403, 423, 429].includes(e.status) && method !== 'GET') Logger.warn(e.message, { status: e.status, code: e.codigo });
      if (api) {
        const out = { error: e.message };
        if (e.codigo) out.code = e.codigo;
        Response.json(out, e.status);
      }
      if (e.status === 401) Response.redirect('login');
      return paginaErro(e.status, e.message);
    }
    if (erroDeBanco(e)) {
      Logger.error('Falha no banco de dados', { sql_state: e.sqlState ?? null, mysql_code: e.errno ?? null, erro: e.message });
      if (e.errno === 1062 && api) Response.json({ error: 'Registro duplicado' }, 400);
      const conexao = ERROS_CONEXAO.includes(Number(e.errno)) || CODIGOS_CONEXAO.includes(e.code);
      const msg = conexao
        ? 'Não foi possível conectar ao banco de dados. Confira DB_HOST, DB_USER, DB_PASS e DB_NAME no arquivo .env e se o MySQL está ligado.'
        : (config.IS_PROD ? 'Erro no banco de dados' : e.message);
      if (api) Response.json({ error: msg }, 500);
      return paginaErro(500, msg);
    }
    const onde = (String(e.stack || '').split('\n')[1] || '').trim();
    Logger.error('Erro não tratado', { erro: e.message, arquivo: onde, tipo: e.constructor?.name });
    const msg = config.IS_PROD ? 'Erro interno' : `${e.message} @ ${onde}`;
    if (api) Response.json({ error: msg }, 500);
    return paginaErro(500, msg);
  }
}

module.exports = { run };
