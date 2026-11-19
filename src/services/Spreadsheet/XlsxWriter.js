/**
 * XlsxWriter — gera .xlsx simples (várias abas, cabeçalho em negrito, números
 * como número, valores em dinheiro com formato #.##0,00) sem dependência pesada:
 * só monta os XMLs e compacta com o adm-zip.
 *
 * Para um número aparecer formatado como dinheiro use XlsxWriter.dinheiro(v) na célula
 * (o equivalente ao "float" da versão PHP); número comum (id, quantidade) vai sem formato.
 */
const AdmZip = require('adm-zip');
const { number_format, num_str } = require('../../helpers');

class Dinheiro {
  constructor(v) { this.v = Number(v) || 0; }
  valueOf() { return this.v; }
  toString() { return String(this.v); }
  toJSON() { return this.v; }
}

const x = (s) => String(s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function col(i) {
  let s = ''; i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** Largura das colunas pelo maior conteúdo (limitada), pra planilha abrir legível. */
function cols(rows) {
  const w = [];
  for (const row of rows) row.forEach((v, c) => {
    const len = v instanceof Dinheiro ? number_format(v.v, 2).length + 2 : Array.from(String(v ?? '')).length;
    w[c] = Math.max(w[c] ?? 8, Math.min(60, len + 2));
  });
  if (!w.length) return '';
  return '<cols>' + w.map((n, c) => `<col min="${c + 1}" max="${c + 1}" width="${n ?? 8}" customWidth="1"/>`).join('') + '</cols>';
}

function sheetXml(rows) {
  let out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + cols(rows) + '<sheetData>';
  rows.forEach((row, r) => {
    out += `<row r="${r + 1}">`;
    row.forEach((v, c) => {
      const ref = col(c) + (r + 1);
      const style = r === 0 ? ' s="1"' : '';
      if (v === null || v === undefined || v === '') return;
      if (v instanceof Dinheiro && r > 0) out += `<c r="${ref}" s="2"><v>${num_str(v.v)}</v></c>`;
      else if (v instanceof Dinheiro || (typeof v === 'number' && Number.isFinite(v))) out += `<c r="${ref}"${style}><v>${num_str(Number(v))}</v></c>`;
      else out += `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    });
    out += '</row>';
  });
  return out + '</sheetData></worksheet>';
}

class XlsxWriter {
  constructor() { this.sheets = []; }

  static dinheiro(v) { return new Dinheiro(v); }
  static ehDinheiro(v) { return v instanceof Dinheiro; }

  addSheet(name, rows) {
    name = Array.from(String(name).replace(/[\\/?*[\]:]/g, ' ')).slice(0, 31).join('');
    this.sheets.push([name, rows]);
  }

  /** @returns {Buffer} */
  output() {
    const z = new AdmZip();
    const add = (nome, txt) => z.addFile(nome, Buffer.from(txt, 'utf8'));
    const n = this.sheets.length;
    let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    for (let i = 1; i <= n; i++) ct += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    add('[Content_Types].xml', ct + '</Types>');
    add('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    let wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    this.sheets.forEach(([name, rows], i) => {
      const k = i + 1;
      wb += `<sheet name="${x(name)}" sheetId="${k}" r:id="rId${k}"/>`;
      rels += `<Relationship Id="rId${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k}.xml"/>`;
      add(`xl/worksheets/sheet${k}.xml`, sheetXml(rows));
    });
    rels += `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    add('xl/workbook.xml', wb + '</sheets></workbook>');
    add('xl/_rels/workbook.xml.rels', rels + '</Relationships>');
    add('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>');
    return z.toBuffer();
  }
}

module.exports = XlsxWriter;
