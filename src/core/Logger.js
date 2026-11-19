/**
 * Logger — log estruturado (uma linha JSON por evento) no stderr.
 *
 * Na AWS o container manda o stderr pro CloudWatch Logs (driver awslogs do Docker),
 * e o CloudWatch consegue filtrar por campo: { $.level = "ERROR" } vira métrica/alarme.
 *
 * Nunca passe senha, token, cookie ou dado sensível no ctx — as chaves abaixo são
 * apagadas por garantia, mas o certo é nem mandar.
 */
const { ctx: contexto } = require('./Context');

const SENSIVEIS = ['password', 'senha', 'senha_atual', 'nova_senha', 'token', 'csrf', 'cookie', 'authorization', 'db_pass', 'secret'];

function isoLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const s = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/** Monta a linha (exportado pra ser testado sem escrever nada). */
function linha(nivel, msg, dados = {}) {
  const limpo = { ...dados };
  for (const k of Object.keys(limpo)) if (SENSIVEIS.includes(String(k).toLowerCase())) limpo[k] = '***';
  const base = {
    ts: isoLocal(),
    level: nivel,
    env: String(process.env.APP_ENV || 'production'),
    version: require('../bootstrap').APP_VERSION,
    msg,
  };
  const c = contexto();
  if (c && c.req) {
    base.method = c.req.method || null;
    base.path = c.req.path || null;
    base.ip = require('../helpers').client_ip();
  }
  for (const [k, v] of Object.entries(limpo)) if (!(k in base)) base[k] = v;
  try { return JSON.stringify(base); } catch { return JSON.stringify({ ...base, ctx: '[não serializável]' }); }
}

function escrever(nivel, msg, dados) { process.stderr.write(linha(nivel, msg, dados) + '\n'); }

module.exports = {
  info: (m, d = {}) => escrever('INFO', m, d),
  warn: (m, d = {}) => escrever('WARN', m, d),
  error: (m, d = {}) => escrever('ERROR', m, d),
  linha,
};
