/**
 * Lê CSV e XLSX (Excel 2007+) sem dependência pesada (adm-zip + xmldom).
 * Devolve uma lista de linhas, cada linha uma lista de textos.
 * Datas do Excel saem como "AAAA-MM-DD"; números como texto ("1234.5").
 */
const fs = require('fs');
const AdmZip = require('adm-zip');
const { DOMParser } = require('@xmldom/xmldom');
const { HttpException } = require('../../core/HttpException');

const MAX_LINHAS = 5000;
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function grande() { return new HttpException(400, `Planilha grande demais (máx. ${MAX_LINHAS} linhas por importação). Divida em arquivos menores.`); }

function ler(arquivo, ext) {
  ext = String(ext).toLowerCase();
  if (ext === 'xlsx') return xlsx(arquivo);
  if (['csv', 'txt'].includes(ext)) return csv(arquivo);
  if (ext === 'xls') throw new HttpException(400, 'Arquivo .xls (Excel 97-2003) não é suportado. No Excel use "Salvar como" → Pasta de Trabalho do Excel (.xlsx) ou CSV.');
  throw new HttpException(400, 'Envie um arquivo .xlsx ou .csv');
}

// ─── CSV ────────────────────────────────────────────────────────────────────
/** Parser de CSV (aspas duplas, "" dentro de aspas, quebra de linha dentro de aspas). */
function parseCsv(txt, sep) {
  const rows = []; let row = []; let campo = ''; let aspas = false; let i = 0; let linhaVazia = true;
  const fechaCampo = () => { row.push(campo); campo = ''; };
  const fechaLinha = () => {
    fechaCampo();
    if (!(linhaVazia && row.length === 1 && row[0] === '')) rows.push(row);
    row = []; linhaVazia = true;
    if (rows.length > MAX_LINHAS + 1) throw grande();
  };
  while (i < txt.length) {
    const c = txt[i];
    if (aspas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i += 2; continue; } aspas = false; i++; continue; }
      campo += c; i++; continue;
    }
    if (c === '"' && campo.trim() === '') { campo = ''; aspas = true; linhaVazia = false; i++; continue; }
    if (c === sep) { fechaCampo(); linhaVazia = false; i++; continue; }
    if (c === '\r') { if (txt[i + 1] === '\n') i++; fechaLinha(); i++; continue; }
    if (c === '\n') { fechaLinha(); i++; continue; }
    campo += c; linhaVazia = false; i++;
  }
  if (campo !== '' || row.length || !linhaVazia) fechaLinha();
  return rows;
}

function csv(arquivo) {
  let raw = fs.readFileSync(arquivo);
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) raw = raw.subarray(3);
  let txt;
  // Excel BR costuma salvar CSV em Windows-1252 (ANSI).
  try { txt = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { txt = new TextDecoder('windows-1252').decode(raw); }
  const primeira = txt.split('\n')[0] || '';
  const cont = { ';': primeira.split(';').length - 1, ',': primeira.split(',').length - 1, '\t': primeira.split('\t').length - 1 };
  let sep = Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0];
  if (cont[sep] === 0) sep = ';';
  const rows = parseCsv(txt, sep).map((r) => r.map((v) => String(v).trim()));
  return limpar(rows);
}

// ─── XLSX ───────────────────────────────────────────────────────────────────
const nomeLocal = (n) => n.localName || String(n.nodeName).replace(/^.*:/, '');
const filhos = (n, nome) => { const out = []; for (let c = n?.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (!nome || nomeLocal(c) === nome)) out.push(c); return out; };
const filho = (n, nome) => filhos(n, nome)[0] || null;

function parseXml(txt) {
  if (txt === null) return null;
  try {
    let erro = false;
    const d = new DOMParser({ onError: (nv) => { if (nv !== 'warning') erro = true; } }).parseFromString(txt, 'text/xml');
    return erro || !d.documentElement ? null : d;
  } catch { return null; }
}

function arquivoZip(z, nome) {
  const e = z.getEntry(nome);
  return e ? e.getData().toString('utf8') : null;
}

function textoRico(el) {
  if (!el) return '';
  const t = filho(el, 't');
  if (t) return t.textContent;
  return filhos(el, 'r').map((r) => filho(r, 't')?.textContent ?? '').join('');
}

function sharedStrings(z) {
  const d = parseXml(arquivoZip(z, 'xl/sharedStrings.xml'));
  if (!d) return [];
  return filhos(d.documentElement, 'si').map(textoRico);
}

/** Índices de estilo (cellXfs) que são formato de data. */
function estilosData(z) {
  const d = parseXml(arquivoZip(z, 'xl/styles.xml'));
  if (!d) return {};
  const raiz = d.documentElement;
  const custom = {};
  for (const nf of filhos(filho(raiz, 'numFmts'), 'numFmt')) custom[Number(nf.getAttribute('numFmtId'))] = nf.getAttribute('formatCode') || '';
  const datas = {};
  filhos(filho(raiz, 'cellXfs'), 'xf').forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId') || 0);
    let ehData = (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58);
    if (!ehData && custom[id] !== undefined) {
      const fmt = custom[id].replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
      ehData = /[dy]|m{3,}|(^|[^h:])mm?([^:]|$)/i.test(fmt) && !/^[#0.,\s%]+$/.test(fmt);
    }
    if (ehData) datas[i] = true;
  });
  return datas;
}

function primeiraAba(z) {
  const w = parseXml(arquivoZip(z, 'xl/workbook.xml'));
  const r = parseXml(arquivoZip(z, 'xl/_rels/workbook.xml.rels'));
  if (w && r) {
    const sheet = filhos(filho(w.documentElement, 'sheets'), 'sheet')[0];
    if (sheet) {
      const rid = sheet.getAttributeNS(NS_REL, 'id') || sheet.getAttribute('r:id');
      for (const rel of filhos(r.documentElement, 'Relationship')) {
        if (rel.getAttribute('Id') === rid) {
          const t = String(rel.getAttribute('Target') || '').replace(/^\/+/, '');
          return t.startsWith('xl/') ? t : 'xl/' + t;
        }
      }
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

function colIndex(ref) {
  const letras = String(ref).toUpperCase().replace(/\d/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Número de série do Excel → AAAA-MM-DD (base 30/12/1899). */
function serialParaData(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const numerico = (v) => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v);

function xlsx(arquivo) {
  let z;
  try { z = new AdmZip(arquivo); z.getEntries(); } catch { throw new HttpException(400, 'Não consegui abrir o arquivo. Ele é mesmo um .xlsx?'); }
  const strings = sharedStrings(z);
  const datas = estilosData(z);
  const txt = arquivoZip(z, primeiraAba(z));
  if (txt === null) throw new HttpException(400, 'Planilha vazia ou corrompida');
  const d = parseXml(txt);
  if (!d) throw new HttpException(400, 'Planilha corrompida');
  const rows = [];
  for (const row of filhos(filho(d.documentElement, 'sheetData'), 'row')) {
    const linha = {};
    let idx = 0;
    for (const c of filhos(row, 'c')) {
      const ref = c.getAttribute('r') || '';
      if (ref !== '') idx = colIndex(ref);
      const t = c.getAttribute('t') || '';
      const s = Number(c.getAttribute('s') || 0);
      const vn = filho(c, 'v');
      const v = vn ? vn.textContent : '';
      let val;
      if (t === 's') val = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') val = textoRico(filho(c, 'is'));
      else if (t === 'b') val = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else if (t === 'str' || t === 'e') val = v;
      else if (v !== '' && datas[s] && numerico(v)) val = serialParaData(parseFloat(v));
      else val = v;
      linha[idx] = String(val).trim();
      idx++;
    }
    const chaves = Object.keys(linha).map(Number);
    if (chaves.length) {
      const max = Math.max(...chaves);
      const cheia = Array(max + 1).fill('');
      for (const [i, v] of Object.entries(linha)) cheia[i] = v;
      rows.push(cheia);
    } else rows.push([]);
    if (rows.length > MAX_LINHAS + 1) throw grande();
  }
  return limpar(rows);
}

/** Tira linhas totalmente vazias do fim. */
function limpar(rows) {
  rows = rows.map((r) => r.map((v) => String(v ?? '')));
  while (rows.length && !rows[rows.length - 1].some((v) => v !== '')) rows.pop();
  return rows;
}

module.exports = { MAX_LINHAS, ler, csv, xlsx, serialParaData, parseCsv };
