/**
 * Lê o XML de uma nota fiscal e devolve os campos que interessam ao financeiro.
 *
 * Formatos aceitos (um leitor para cada, escolhido pela FabricaLeitorNotaFiscal):
 *  - NF-e / NFC-e (modelo 55/65, layout da SEFAZ — arquivo "procNFe" ou só "NFe")
 *  - NFS-e no padrão ABRASF (a maioria das prefeituras) e no padrão Nacional (gov.br/nfse)
 */
const DocumentoXml = require('./NotaFiscal/DocumentoXml');
const FabricaLeitorNotaFiscal = require('./NotaFiscal/FabricaLeitorNotaFiscal');
const LeitorNfe = require('./NotaFiscal/LeitorNfe');

/** Código tPag da SEFAZ → tipo de forma de pagamento do sistema. */
const TPAG = LeitorNfe.TPAG;

/** @param {string|Buffer} xml */
function ler(xml) {
  const doc = DocumentoXml.carregar(xml);
  return FabricaLeitorNotaFiscal.criar(doc).ler(doc);
}

module.exports = { TPAG, ler, decodificar: DocumentoXml.decodificar };
