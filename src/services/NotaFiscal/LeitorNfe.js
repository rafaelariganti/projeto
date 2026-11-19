/** Produto concreto: NF-e / NFC-e (modelo 55/65, layout da SEFAZ — "procNFe" ou só "NFe"). */
const LeitorNotaFiscal = require('./LeitorNotaFiscal');
const DocumentoXml = require('./DocumentoXml');
const { int } = require('../../helpers');

/** Código tPag da SEFAZ → tipo de forma de pagamento do sistema. */
const TPAG = { '01': 'dinheiro', '03': 'credito', '04': 'debito', '05': 'credito', 15: 'boleto', 16: 'transferencia', 17: 'pix', 18: 'transferencia' };

class LeitorNfe extends LeitorNotaFiscal {
  static TPAG = TPAG;

  reconhece(doc) { return doc.temAlguma('infNFe'); }

  ler(doc) {
    const B = LeitorNotaFiscal;
    const inf = doc.no('infNFe');
    const ide = doc.no('ide', inf);
    const out = B.base();
    const mod = doc.txt(['mod'], ide);
    out.modelo = mod === '65' ? 'NFC-e' : 'NF-e';
    out.numero = doc.txt(['nNF'], ide);
    out.serie = doc.txt(['serie'], ide);
    const id = DocumentoXml.atributo(inf, 'Id');
    const chave = B.doc(id) || B.doc(doc.txt(['chNFe']));
    out.chave = chave || null;
    out.data_emissao = B.data(doc.txt(['dhEmi', 'dEmi'], ide));
    out.natureza = doc.txt(['natOp'], ide);
    const tp = doc.txt(['tpNF'], ide);
    out.tp_nf = tp !== null ? int(tp) : null;

    const e = B.pessoa(doc, doc.no('emit', inf));
    const d = B.pessoa(doc, doc.no('dest', inf));
    out.emitente_nome = e.nome; out.emitente_doc = e.doc; out.emitente_fantasia = e.fantasia;
    out.destinatario_nome = d.nome; out.destinatario_doc = d.doc;
    out.valor = B.valor(doc.txt(['total/ICMSTot/vNF', 'vNF'], inf));

    // Itens → descrição curta ("Produto A, Produto B e mais 3 itens")
    const itens = doc.nos('det/prod/xProd', inf).map((p) => String(p.textContent).trim());
    out.descricao = B.resumoItens(itens) ?? out.natureza;

    for (const dup of doc.nos('cobr/dup', inf)) {
      out.duplicatas.push({ numero: doc.txt(['nDup'], dup), vencimento: B.data(doc.txt(['dVenc'], dup)), valor: B.valor(doc.txt(['vDup'], dup)) });
    }
    for (const p of doc.nos('pag/detPag', inf)) {
      const cod = String(doc.txt(['tPag'], p) ?? '').padStart(2, '0');
      out.pagamentos.push({ codigo: cod, tipo: TPAG[cod] ?? null, valor: B.valor(doc.txt(['vPag'], p)) });
    }
    out.observacoes = doc.txt(['infAdic/infCpl'], inf);
    return out;
  }
}

module.exports = LeitorNfe;
