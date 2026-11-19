/**
 * Onde os arquivos do sistema ficam guardados (uploads, notas fiscais, comprovantes, importações em andamento).
 *
 *   ARMAZENAMENTO=disco  → pastas uploads/ e storage/ (PC, VPS, Docker, AWS)
 *   ARMAZENAMENTO=banco  → tabela `arquivos` no MySQL (Vercel e outros serverless, onde o disco some a cada acesso)
 *
 * Sem a variável: "banco" quando roda na Vercel, "disco" no resto.
 * O caminho lógico é sempre o mesmo ("uploads/perfil/x.png", "storage/notas/y.xml"),
 * então o banco de dados não muda conforme o modo.
 */
const fs = require('fs');
const path = require('path');
const config = require('../bootstrap');
const Database = require('../core/Database');
const { env } = require('../helpers');

const MIME = {
  pdf: 'application/pdf', xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', txt: 'text/plain; charset=utf-8', zip: 'application/zip', json: 'application/json',
};

function modo() {
  const m = String(env('ARMAZENAMENTO', process.env.VERCEL ? 'banco' : 'disco')).toLowerCase();
  return m === 'banco' ? 'banco' : 'disco';
}

function mimeDe(rel) { return MIME[path.extname(rel).slice(1).toLowerCase()] || 'application/octet-stream'; }

/** Caminho relativo seguro (só uploads/ e storage/, sem ".."). */
function limpo(rel) {
  const r = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!r || r.includes('..') || !(r.startsWith('uploads/') || r.startsWith('storage/'))) return null;
  return r;
}

const absoluto = (rel) => path.join(config.ROOT_DIR, rel);

/** Grava o conteúdo (Buffer ou texto). */
async function gravar(rel, conteudo) {
  const r = limpo(rel);
  if (!r) throw new Error('Caminho de arquivo inválido: ' + rel);
  const buf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), 'utf8');
  if (modo() === 'banco') {
    await Database.run('REPLACE INTO arquivos (caminho, mime, tamanho, conteudo) VALUES (?,?,?,?)', [r, mimeDe(r), buf.length, buf]);
    return;
  }
  fs.mkdirSync(path.dirname(absoluto(r)), { recursive: true });
  fs.writeFileSync(absoluto(r), buf);
}

/** Conteúdo do arquivo ou null se não existir. */
async function ler(rel) {
  const r = limpo(rel);
  if (!r) return null;
  if (modo() === 'banco') {
    const row = await Database.one('SELECT conteudo FROM arquivos WHERE caminho=?', [r]);
    return row ? Buffer.from(row.conteudo) : null;
  }
  try { return fs.statSync(absoluto(r)).isFile() ? fs.readFileSync(absoluto(r)) : null; } catch { return null; }
}

async function existe(rel) {
  const r = limpo(rel);
  if (!r) return false;
  if (modo() === 'banco') return !!(await Database.one('SELECT 1 AS ok FROM arquivos WHERE caminho=?', [r]));
  try { return fs.statSync(absoluto(r)).isFile(); } catch { return false; }
}

async function apagar(rel) {
  const r = limpo(rel);
  if (!r) return;
  if (modo() === 'banco') { await Database.run('DELETE FROM arquivos WHERE caminho=?', [r]); return; }
  try { fs.unlinkSync(absoluto(r)); } catch { /* já não existe */ }
}

/** Apaga os arquivos de uma pasta mais velhos que `idadeSeg` (usado nas importações em andamento). */
async function limparAntigos(pasta, idadeSeg) {
  const p = limpo(pasta.replace(/\/?$/, '/'));
  if (!p) return;
  if (modo() === 'banco') {
    await Database.run('DELETE FROM arquivos WHERE caminho LIKE ? AND criado_em < (NOW() - INTERVAL ? SECOND)', [p + '%', idadeSeg]);
    return;
  }
  let nomes = [];
  try { nomes = fs.readdirSync(absoluto(p)); } catch { return; }
  for (const n of nomes) {
    if (n === '.gitkeep') continue;
    const full = path.join(absoluto(p), n);
    try { if (fs.statSync(full).mtimeMs < Date.now() - idadeSeg * 1000) fs.unlinkSync(full); } catch { /* ignora */ }
  }
}

module.exports = { modo, mimeDe, gravar, ler, existe, apagar, limparAntigos };
