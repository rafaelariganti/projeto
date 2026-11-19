/**
 * GET /health — usado pelo CloudFront/monitoramento, pelo deploy (só troca a versão se ficar UP)
 * e pelo teste de carga. Não exige login e não expõe nada sensível.
 */
const config = require('../bootstrap');
const Database = require('../core/Database');
const Logger = require('../core/Logger');
const Response = require('../core/Response');
const { env } = require('../helpers');

async function check() {
  if (config.DEMO) Response.json({ status: 'UP', version: config.APP_VERSION, environment: 'demo', checks: { database: 'DEMO' }, latency_ms: 0 });
  const inicio = Date.now();
  let db = 'UP';
  try {
    await Database.one('SELECT 1 AS ok');
  } catch (e) {
    db = 'DOWN';
    Logger.error('health: banco indisponível', { erro: e.message });
  }
  Response.header('Cache-Control', 'no-store');
  Response.json({
    status: db === 'UP' ? 'UP' : 'DOWN',
    version: config.APP_VERSION,
    environment: String(env('APP_ENV', 'production')),
    checks: { database: db },
    latency_ms: Date.now() - inicio,
  }, db === 'UP' ? 200 : 503);
}

module.exports = { check };
