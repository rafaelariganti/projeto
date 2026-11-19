/**
 * Produto da FACTORY: um leitor por layout de nota fiscal (classe base abstrata).
 * Traz o que todos os layouts usam (formato de saída, conversão de data/valor/documento,
 * emitente/destinatário). Cada subclasse só diz como reconhecer o seu layout e onde estão os campos nele.
 */
const { round } = require('../../helpers');

class LeitorNotaFiscal {
  /** Esse XML é do layout que esta classe sabe ler? */
  reconhece(doc) { throw new Error('implemente reconhece()'); } // eslint-disable-line no-unused-vars

  /** Campos da nota, sempre no formato de base(). */
  ler(doc) { throw new Error('implemente ler()'); } // eslint-disable-line no-unused-vars

  static base() {
    return {
      modelo: null, numero: null, serie: null, chave: null, data_emissao: null, valor: 0,
      emitente_nome: null, emitente_doc: null, emitente_fantasia: null,
      destinatario_nome: null, destinatario_doc: null,
      descricao: null, observacoes: null, natureza: null, tp_nf: null,
      duplicatas: [], pagamentos: [],
    };
  }

  static data(v) {
    if (!v) return null;
    let m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    m = String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
  }

  static valor(v) {
    if (v === null || v === undefined || v === '') return 0;
    v = String(v).trim();
    if (v.includes(',')) v = v.replace(/\./g, '').replace(/,/g, '.'); // 1.234,56
    const n = parseFloat(v);
    return Number.isFinite(n) ? round(n, 2) : 0;
  }

  static doc(v) {
    const d = v ? String(v).replace(/\D/g, '') : '';
    return d !== '' ? d : null;
  }

  static pessoa(doc, n, nomes = ['xNome', 'RazaoSocial', 'Nome']) {
    if (!n) return { nome: null, doc: null, fantasia: null };
    return {
      nome: doc.txt(nomes, n),
      doc: LeitorNotaFiscal.doc(doc.txt(['CNPJ', 'CPF', 'Cnpj', 'Cpf'], n)),
      fantasia: doc.txt(['xFant', 'NomeFantasia'], n),
    };
  }

  static corta(v, n = 200) {
    if (v === null || v === undefined) return null;
    v = String(v).replace(/\s+/gu, ' ').trim();
    const a = Array.from(v);
    return a.length > n ? a.slice(0, n - 1).join('') + '…' : v;
  }

  static resumoItens(itens) {
    itens = itens.filter((x) => x);
    if (!itens.length) return null;
    let txt = itens.slice(0, 2).join(', ');
    if (itens.length > 2) txt += ' e mais ' + (itens.length - 2) + ' ite' + (itens.length - 2 === 1 ? 'm' : 'ns');
    return LeitorNotaFiscal.corta(txt);
  }
}

module.exports = LeitorNotaFiscal;
