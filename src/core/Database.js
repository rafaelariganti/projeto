/**
 * Database — pool de conexões MySQL (mysql2) + atalhos de consulta usados pelos Models.
 * Dentro de Database.transaction() todas as consultas usam a mesma conexão
 * (guardada no contexto da requisição), então dá pra fazer "tudo ou nada".
 */
const mysql = require('mysql2/promise');
const { AsyncLocalStorage } = require('async_hooks');
const { env } = require('../helpers');

const txStorage = new AsyncLocalStorage();
let pool = null;

function offsetFuso() {
  const min = -new Date().getTimezoneOffset();
  const s = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/**
 * SSL: bancos na nuvem (Aiven, TiDB, PlanetScale, Railway público, RDS) costumam exigir.
 *   DB_SSL=1            → conexão criptografada, validando o certificado
 *   DB_SSL_CA=<PEM>     → certificado da autoridade (quando o provedor fornece um próprio, ex.: Aiven)
 *   DB_SSL_INSEGURO=1   → criptografa sem validar o certificado (só se o provedor não der o CA)
 */
function ssl() {
  if (env('DB_SSL', '0') !== '1') return undefined;
  const o = { minVersion: 'TLSv1.2', rejectUnauthorized: env('DB_SSL_INSEGURO', '0') !== '1' };
  const ca = env('DB_SSL_CA', '');
  if (ca) o.ca = ca.replace(/\\n/g, '\n');
  return o;
}

/** Dados de conexão (também usados pelo armazenamento de sessões). */
function conexao() {
  return {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', 3306)),
    user: env('DB_USER', 'root'),
    password: env('DB_PASS', ''),
    database: env('DB_NAME', 'dre_oaf'),
    ssl: ssl(),
  };
}

function opcoes(comBanco) {
  return {
    ssl: ssl(),
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', 3306)),
    user: env('DB_USER', 'root'),
    password: env('DB_PASS', ''),
    database: comBanco ? env('DB_NAME', 'dre_oaf') : undefined,
    charset: 'utf8mb4',
    dateStrings: true,      // DATE/DATETIME chegam como texto, igual ao PDO
    decimalNumbers: false,  // DECIMAL chega como texto ("1000.00"), igual ao PDO — os Models convertem com float()
    supportBigNumbers: true,
    bigNumberStrings: false,
    timezone: 'local',
    waitForConnections: true,
    // Na Vercel cada instância é um processo separado: poucas conexões por instância pra não estourar o limite do banco.
    connectionLimit: Number(env('DB_POOL', process.env.VERCEL ? 2 : 10)),
    maxIdle: Number(env('DB_POOL', process.env.VERCEL ? 2 : 10)),
    idleTimeout: 60000,
    enableKeepAlive: true,
    multipleStatements: false,
  };
}

async function criarPool() {
  const p = mysql.createPool(opcoes(true));
  p.on('connection', (c) => { c.query(`SET time_zone = '${offsetFuso()}'`); });
  try {
    const c = await p.getConnection();
    c.release();
  } catch (e) {
    await p.end().catch(() => {});
    // 1049 = banco não existe: tenta criar. Em hospedagem compartilhada o usuário
    // pode não ter permissão — aí o erro sobe normal (crie o banco no painel).
    if (e.errno !== 1049) throw e;
    const tmp = await mysql.createConnection(opcoes(false));
    const nome = String(env('DB_NAME', 'dre_oaf')).replace(/`/g, '');
    await tmp.query(`CREATE DATABASE IF NOT EXISTS \`${nome}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tmp.end();
    return criarPool();
  }
  return p;
}

let criando = null;
async function getPool() {
  if (pool) return pool;
  if (!criando) criando = criarPool().then((p) => { pool = p; return p; }).finally(() => { criando = null; });
  return criando;
}

/** Conexão da transação atual (se houver) ou o pool. */
async function executor() {
  const tx = txStorage.getStore();
  return tx || getPool();
}

/** mysql2 não aceita undefined nem boolean em parâmetro: normaliza. */
function params(p) {
  return (p || []).map((v) => (v === undefined ? null : v === true ? 1 : v === false ? 0 : v));
}

async function stmt(sql, p = []) {
  const ex = await executor();
  const [rows] = await ex.query(sql, params(p));
  return rows;
}

/** Todas as linhas. */
async function all(sql, p = []) {
  const rows = await stmt(sql, p);
  return Array.isArray(rows) ? rows.map((r) => ({ ...r })) : [];
}

/** Primeira linha ou null. */
async function one(sql, p = []) {
  const rows = await stmt(sql, p);
  return Array.isArray(rows) && rows.length ? { ...rows[0] } : null;
}

/** Primeira coluna da primeira linha. */
async function value(sql, p = []) {
  const r = await one(sql, p);
  if (!r) return null;
  const k = Object.keys(r)[0];
  return r[k];
}

/** UPDATE/DELETE: devolve quantas linhas mudaram. */
async function run(sql, p = []) {
  const r = await stmt(sql, p);
  return r.affectedRows ?? 0;
}

/** INSERT: devolve o id criado. */
async function insert(sql, p = []) {
  const r = await stmt(sql, p);
  return Number(r.insertId || 0);
}

/** Executa SQL bruto (DDL), sem parâmetros. */
async function exec(sql) {
  const ex = await executor();
  await ex.query(sql);
}

/** Executa várias operações como uma só (tudo ou nada). */
async function transaction(fn) {
  if (txStorage.getStore()) return fn(); // já está dentro de uma transação
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const r = await txStorage.run(conn, fn);
    await conn.commit();
    return r;
  } catch (e) {
    try { await conn.rollback(); } catch { /* ignora */ }
    throw e;
  } finally {
    conn.release();
  }
}

async function fechar() { if (pool) { await pool.end(); pool = null; } }

module.exports = { conexao, getPool, all, one, value, run, insert, exec, transaction, fechar };
