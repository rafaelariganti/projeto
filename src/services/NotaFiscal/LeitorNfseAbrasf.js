/** Produto concreto: NFS-e no padrão ABRASF (a maioria das prefeituras). */
const LeitorNotaFiscal = require('./LeitorNotaFiscal');

class LeitorNfseAbrasf extends LeitorNotaFiscal {
  reconhece(doc) { return doc.temAlguma('InfNfse', 'Nfse', 'CompNfse', 'InfDeclaracaoPrestacaoServico'); }

  ler(doc) {
    const B = LeitorNotaFiscal;
    const out = B.base();
    out.modelo = 'NFS-e';
    const inf = doc.no('InfNfse') ?? doc.no('Nfse') ?? doc.raiz();
    out.numero = doc.txt(['Numero', 'NumeroNfse'], inf);
    out.chave = doc.txt(['CodigoVerificacao'], inf);
    out.data_emissao = B.data(doc.txt(['DataEmissao', 'DataEmissaoNfse', 'Competencia'], inf));

    const prest = doc.no('PrestadorServico', inf) ?? doc.no('Prestador', inf);
    const toma = doc.no('TomadorServico', inf) ?? doc.no('Tomador', inf);
    const p = B.pessoa(doc, prest);
    const t = B.pessoa(doc, toma);
    out.emitente_nome = p.nome; out.emitente_doc = p.doc; out.emitente_fantasia = p.fantasia;
    out.destinatario_nome = t.nome; out.destinatario_doc = t.doc;
    out.valor = B.valor(doc.txt(['ValoresNfse/ValorLiquidoNfse', 'ValorLiquidoNfse', 'Servico/Valores/ValorServicos', 'ValorServicos'], inf));
    out.descricao = B.corta(doc.txt(['Servico/Discriminacao', 'Discriminacao'], inf));
    out.observacoes = doc.txt(['OutrasInformacoes'], inf);
    return out;
  }
}

module.exports = LeitorNfseAbrasf;
