/** Escreve CSV no mesmo formato do fputcsv do PHP (separador ";" e BOM pro Excel BR abrir certo). */
function campo(v, sep) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r\t ]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function linha(valores, sep = ';') { return valores.map((v) => campo(v, sep)).join(sep) + '\n'; }

/** @returns {Buffer} com BOM UTF-8 */
function gerar(linhas, sep = ';') {
  return Buffer.from('﻿' + linhas.map((l) => linha(l, sep)).join(''), 'utf8');
}

module.exports = { linha, gerar };
