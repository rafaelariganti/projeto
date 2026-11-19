/** Produto concreto: NFS-e no padrão Nacional (gov.br/nfse). */
const LeitorNotaFiscal = require('./LeitorNotaFiscal');
const DocumentoXml = require('./DocumentoXml');

class LeitorNfseNacional extends LeitorNotaFiscal {
  reconhece(doc) { return doc.temAlguma('infNFSe', 'infDPS'); }

  ler(doc) {
    const B = LeitorNotaFiscal;
    const out = B.base();
    out.modelo = 'NFS-e';
    const inf = doc.no('infNFSe') ?? doc.no('infDPS');
    out.numero = doc.txt(['nNFSe', 'nDPS'], inf);
    out.serie = doc.txt(['serie']);
    const id = DocumentoXml.atributo(inf, 'Id');
    out.chave = B.doc(id) || null;
    out.data_emissao = B.data(doc.txt(['dhEmi', 'dhProc', 'dCompet']));
    const prest = B.pessoa(doc, doc.no('emit') ?? doc.no('prest'));
    const toma = B.pessoa(doc, doc.no('toma'));
    out.emitente_nome = prest.nome; out.emitente_doc = prest.doc; out.emitente_fantasia = prest.fantasia;
    out.destinatario_nome = toma.nome; out.destinatario_doc = toma.doc;
    out.valor = B.valor(doc.txt(['valores/vLiq', 'vLiq', 'vServPrest/vServ', 'vServ']));
    out.descricao = B.corta(doc.txt(['xDescServ', 'xTribNac', 'xTribMun']));
    out.observacoes = doc.txt(['xInfComp']);
    return out;
  }
}

module.exports = LeitorNfseNacional;
