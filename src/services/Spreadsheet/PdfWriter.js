/**
 * PdfWriter — gerador de PDF mínimo (texto Helvetica, linhas e retângulos),
 * suficiente pro relatório DRE. Sem dependência: escreve o PDF na mão.
 * Coordenadas em pontos, com Y contado a partir do TOPO da página.
 */
const W = 595.28; const H = 841.89; // A4

// Larguras (1/1000 em) dos caracteres 32..126 — AFM padrão Helvetica / Helvetica-Bold.
const WR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// Unicode → Windows-1252 (o que não existir vira equivalente simples ou "?").
const CP1252 = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
const TROCA = { '−': '-', '∅': 'O', '→': '->', '·': '·', ' ': ' ' };

function cp1252(s) {
  const out = [];
  for (let ch of String(s)) {
    if (TROCA[ch] !== undefined) ch = TROCA[ch];
    for (const c of ch) {
      const cp = c.codePointAt(0);
      if (cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF)) out.push(cp);
      else if (CP1252[c] !== undefined) out.push(CP1252[c]);
      else out.push(0x3F);
    }
  }
  return Buffer.from(out);
}

const f2 = (n) => Number(n).toFixed(2);
const f3 = (n) => Number(n).toFixed(3);

class PdfWriter {
  static W = W;
  static H = H;

  constructor() { this.pages = []; this.cur = null; this.fonte = 'F1'; this.size = 10; }

  addPage() { if (this.cur !== null) this.pages.push(this.cur); this.cur = [Buffer.from(' ')]; }

  font(bold, size) { this.fonte = bold ? 'F2' : 'F1'; this.size = size; }

  static rgb(hex) {
    const h = String(hex).replace(/^#/, '');
    return `${f3(parseInt(h.slice(0, 2), 16) / 255)} ${f3(parseInt(h.slice(2, 4), 16) / 255)} ${f3(parseInt(h.slice(4, 6), 16) / 255)}`;
  }

  static enc(s) {
    const b = cp1252(String(s).replace(/\r/g, '').replace(/\n/g, ' '));
    const out = [];
    for (const byte of b) {
      if (byte === 0x5C || byte === 0x28 || byte === 0x29) out.push(0x5C);
      out.push(byte);
    }
    return Buffer.from(out);
  }

  width(s) {
    let w = 0; const tab = this.fonte === 'F2' ? WB : WR;
    for (const o of cp1252(s)) w += (o >= 32 && o <= 126) ? tab[o - 32] : 556;
    return w * this.size / 1000;
  }

  escrever(...partes) { for (const p of partes) this.cur.push(Buffer.isBuffer(p) ? p : Buffer.from(p, 'latin1')); }

  text(x, y, s, color = '#1a1a1a') {
    const py = H - y - this.size; // y = topo da linha
    this.escrever(`BT ${PdfWriter.rgb(color)} rg /${this.fonte} ${f2(this.size)} Tf ${f2(x)} ${f2(py)} Td (`, PdfWriter.enc(s), ') Tj ET\n');
  }

  textRight(xRight, y, s, color = '#1a1a1a') { this.text(xRight - this.width(s), y, s, color); }

  textCenter(y, s, color = '#1a1a1a') { this.text((W - this.width(s)) / 2, y, s, color); }

  line(x1, y1, x2, y2, color = '#e0e0e0', w = 1) {
    this.escrever(`${PdfWriter.rgb(color)} RG ${f2(w)} w ${f2(x1)} ${f2(H - y1)} m ${f2(x2)} ${f2(H - y2)} l S\n`);
  }

  rect(x, y, w, h, fill) {
    this.escrever(`${PdfWriter.rgb(fill)} rg ${f2(x)} ${f2(H - y - h)} ${f2(w)} ${f2(h)} re f\n`);
  }

  /** @returns {Buffer} */
  output() {
    if (this.cur !== null) { this.pages.push(this.cur); this.cur = null; }
    const objs = {};
    objs[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
    objs[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objs[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = []; let n = 5;
    for (const partes of this.pages) {
      const content = Buffer.concat(partes);
      const pid = n++; const cid = n++;
      kids.push(`${pid} 0 R`);
      objs[pid] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
      objs[cid] = Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]);
    }
    objs[2] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
    const ids = Object.keys(objs).map(Number).sort((a, b) => a - b);
    const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let tam = partes[0].length;
    const off = [];
    for (const i of ids) {
      off.push(tam);
      const b = Buffer.concat([Buffer.from(`${i} 0 obj\n`), objs[i], Buffer.from('\nendobj\n')]);
      partes.push(b); tam += b.length;
    }
    let fim = `xref\n0 ${ids.length + 1}\n0000000000 65535 f \n`;
    for (const o of off) fim += `${String(o).padStart(10, '0')} 00000 n \n`;
    fim += `trailer << /Size ${ids.length + 1} /Root 1 0 R >>\nstartxref\n${tam}\n%%EOF`;
    partes.push(Buffer.from(fim));
    return Buffer.concat(partes);
  }
}

module.exports = PdfWriter;
