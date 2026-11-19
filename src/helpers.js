/**
 * helpers.js — funções pequenas usadas em todo lugar (views, models, controllers).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./bootstrap');
const { ctx } = require('./core/Context');
const { HttpException } = require('./core/HttpException');

const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function env(k, def = null) {
  const v = process.env[k];
  return v === undefined || v === '' ? def : v;
}

/** Equivalente ao empty() do PHP: null, '', 0, '0', false, [] e {} vazios. */
function empty(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '' || v === '0') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) return Object.keys(v).length === 0;
  return Number.isNaN(v);
}

/** Escapa texto pra HTML (usado nas views). */
function e(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/** Caminho base da aplicação (BASE_PATH no .env, padrão "/"). */
function base_path() {
  let b = env('BASE_PATH', '/');
  if (!b.startsWith('/')) b = '/' + b;
  return b.replace(/\/+$/, '') + '/';
}
function url(p = '') { return base_path() + String(p).replace(/^\/+/, ''); }

/** Arquivo estático com ?v= pra não pegar cache velho depois de atualizar o sistema. */
const cacheMtime = new Map();
function asset(p) {
  const rel = String(p).replace(/^\/+/, '');
  let v = cacheMtime.get(rel);
  if (v === undefined || !config.IS_PROD) {
    const full = path.join(config.ROOT_DIR, 'assets', rel);
    try { v = Math.floor(fs.statSync(full).mtimeMs / 1000); } catch { v = config.APP_VERSION; }
    cacheMtime.set(rel, v);
  }
  return url('assets/' + rel) + '?v=' + v;
}

function str_or_null(v) { const s = String(v ?? '').trim(); return s === '' ? null : s; }
function is_numeric(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string') return false;
  return /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v);
}
function num(v) { return is_numeric(v) ? parseFloat(v) : 0; }
/** (int) do PHP: pega o número do começo da string; não numérico vira 0. */
function int(v) {
  if (v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : 0;
  const m = String(v).trim().match(/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?/);
  return m ? Math.trunc(parseFloat(m[0])) : 0;
}
/** (float) do PHP. */
function float(v) {
  if (v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
/** round() do PHP (meio pra longe do zero, com correção de ponto flutuante). */
function round(v, casas = 0) {
  const f = Math.pow(10, casas);
  const n = Number(v) * f;
  const r = Math.round(Math.abs(n) + 1e-9 * Math.max(1, Math.abs(n))) * Math.sign(n);
  return (r / f) + 0;
}
function only_digits(v) { return String(v ?? '').replace(/\D/g, ''); }
/** mb_substr (por caractere, não por byte). */
function mb_substr(v, ini, n) { const a = Array.from(String(v ?? '')); return a.slice(ini, n === undefined ? undefined : ini + n).join(''); }
function cut(v, n) { return v === null || v === undefined ? null : mb_substr(v, 0, n); }
function number_format(v, casas = 0, dec = '.', mil = ',') {
  const neg = Number(v) < 0;
  const fixo = Math.abs(round(Number(v), casas)).toFixed(casas);
  let [i, d] = fixo.split('.');
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, mil);
  return (neg && Number(fixo) !== 0 ? '-' : '') + i + (casas ? dec + d : '');
}
/** Número → texto como o PHP faz ao concatenar (14 dígitos significativos: 44701.85 e não 44701.850000000006). */
function num_str(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(14)));
}
function brl(v) { return 'R$ ' + number_format(v, 2, ',', '.'); }

function req() { const c = ctx(); return c ? c.req : null; }

/** IP do cliente. X-Forwarded-For só vale com TRUST_PROXY=1 (senão qualquer um forja o IP e fura o limite de tentativas). */
function client_ip() {
  const r = req();
  if (!r) return '';
  let ip = String(r.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const h = r.headers || {};
  // AWS: o API Gateway sobrescreve X-Client-Ip com o IP real (o usuário não consegue forjar).
  if (env('TRUST_PROXY') === '1' && h['x-client-ip'] && origem_confiavel()) return String(h['x-client-ip']).trim().slice(0, 64);
  if (env('TRUST_PROXY') === '1' && h['x-forwarded-for']) ip = String(h['x-forwarded-for']).split(',')[0].trim();
  return ip.slice(0, 64);
}

function hash_equals(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * A requisição veio do proxy autorizado (API Gateway)? Só vale quando ORIGIN_SECRET está definido
 * (na AWS). Localmente sem ORIGIN_SECRET sempre retorna true.
 */
function origem_confiavel() {
  const segredo = String(env('ORIGIN_SECRET', ''));
  const r = req();
  if (segredo === '' || !r) return true;
  return hash_equals(segredo, String(r.headers['x-origin-verify'] || ''));
}

/** Caminho relativo de upload pro front (sem barra inicial). */
function public_path(p) { return p ? String(p).replace(/^\/+/, '') : null; }

/** Valida CNPJ pelos dígitos verificadores. */
function cnpj_valido(cnpj) {
  const c = only_digits(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base, pesos) => { let s = 0; pesos.forEach((p, i) => { s += Number(base[i]) * p; }); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(c[12]) === d1 && Number(c[13]) === d2;
}
function cpf_valido(cpf) {
  const c = only_digits(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0; for (let i = 0; i < t; i++) s += Number(c[i]) * ((t + 1) - i);
    const d = ((10 * s) % 11) % 10;
    if (Number(c[t]) !== d) return false;
  }
  return true;
}
/** Fornecedor/cliente pode ser empresa (CNPJ) ou pessoa física (CPF). */
function doc_valido(doc) { const n = only_digits(doc).length; return n === 14 ? cnpj_valido(doc) : (n === 11 && cpf_valido(doc)); }
function fmt_cnpj(cnpj) {
  const c = only_digits(cnpj);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : cnpj;
}
function fmt_doc(doc) {
  const c = only_digits(doc);
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  return fmt_cnpj(doc);
}

/** Agência (0000 ou 0000-0) e conta (até 12 dígitos + DV). DV pode ser X. Vazio = null. */
function agencia_valida(v) {
  v = String(v ?? '').trim().toUpperCase();
  if (v === '') return null;
  if (!/^\d{1,4}(-[\dX])?$/.test(v)) throw new HttpException(400, 'Agência inválida: use até 4 números e, se tiver, o dígito (ex.: 0350 ou 0350-1)');
  return v;
}
function conta_valida(v) {
  v = String(v ?? '').trim().toUpperCase();
  if (v === '') return null;
  if (!/^\d{1,12}(-[\dX])?$/.test(v)) throw new HttpException(400, 'Conta inválida: use até 12 números e o dígito (ex.: 12345-6)');
  return v;
}

/** Texto curto do que mudou entre o registro antigo e o novo, pro log. */
function diff_log(antes, depois, rotulos) {
  const m = [];
  for (const [c, label] of Object.entries(rotulos)) {
    const a = antes[c] ?? null; const d = depois[c] ?? null;
    const igual = is_numeric(a) && is_numeric(d) ? parseFloat(a) === parseFloat(d) : String(a ?? '') === String(d ?? '');
    if (igual) continue;
    m.push(`${label}: ${(a === null || a === '') ? '∅' : a} → ${(d === null || d === '') ? '∅' : d}`);
  }
  return m.join('; ');
}
function nome_e_mudancas(nome, diff) { return diff ? `${nome} — ${diff}` : nome; }

/** Datas no formato do MySQL, no fuso do sistema. */
const pad = (n, t = 2) => String(n).padStart(t, '0');
function hoje() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function agora() { const d = new Date(); return `${hoje()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function ano_atual() { return new Date().getFullYear(); }
/** Converte 'Y-m-d' (ou 'Y-m-d H:i:s') em timestamp (segundos), no fuso local. */
function strtotime(s) {
  if (!s) return false;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) { const t = Date.parse(s); return Number.isNaN(t) ? false : Math.floor(t / 1000); }
  return Math.floor(new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() / 1000);
}
function time() { return Math.floor(Date.now() / 1000); }
/** date('d/m/Y', ts) e afins (só os formatos usados no sistema). */
function date(fmt, ts) {
  const d = ts === undefined ? new Date() : new Date(ts * 1000);
  const map = { d: pad(d.getDate()), m: pad(d.getMonth() + 1), Y: d.getFullYear(), y: String(d.getFullYear()).slice(2), H: pad(d.getHours()), i: pad(d.getMinutes()), s: pad(d.getSeconds()), j: d.getDate(), n: d.getMonth() + 1, t: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() };
  return fmt.replace(/[dmYyHisjnt]/g, (c) => map[c]);
}
/** Data 'Y-m-d' → 'd/m/Y'. */
function data_br(s) { const t = strtotime(s); return t === false ? '' : date('d/m/Y', t); }

/** Ano vindo da query (?year=), limitado a uma faixa sã. */
function ano_param() {
  const r = req();
  const y = int(r?.query?.year ?? ano_atual());
  return (y >= 1900 && y <= 2200) ? y : ano_atual();
}
function mes_de(d) { return int(String(d ?? '').slice(5, 7)); }
function dias_no_mes(m, y) { return new Date(y, m, 0).getDate(); }

/** Regra de senha nova: 8+ caracteres, com pelo menos uma letra e um número. */
function senha_fraca(senha) {
  senha = String(senha ?? '');
  if (Buffer.byteLength(senha) < 8) return 'A senha precisa ter pelo menos 8 caracteres';
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'A senha precisa ter letras e números';
  return null;
}

function filter_email(v) {
  // Aproximação do FILTER_VALIDATE_EMAIL do PHP.
  return /^(?!\.)[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+(?<!\.)@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(String(v)) && !String(v).includes('..');
}

function bin2hex(n) { return crypto.randomBytes(n).toString('hex'); }

module.exports = {
  MESES_LONGOS, MESES_CURTOS, env, empty, e, base_path, url, asset, str_or_null, is_numeric, num, int, float, round,
  only_digits, mb_substr, cut, number_format, num_str, brl, client_ip, hash_equals, origem_confiavel, public_path,
  cnpj_valido, cpf_valido, doc_valido, fmt_cnpj, fmt_doc, agencia_valida, conta_valida, diff_log, nome_e_mudancas,
  hoje, agora, ano_atual, strtotime, time, date, data_br, ano_param, mes_de, dias_no_mes, senha_fraca, filter_email, bin2hex, pad,
};
