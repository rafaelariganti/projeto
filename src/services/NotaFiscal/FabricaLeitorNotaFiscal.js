/**
 * PADRÃO FACTORY — decide qual leitor cria para cada XML.
 * Quem usa (NotaFiscalXml, importação em lote, sugestão de lançamento) não sabe
 * nada de NF-e ou NFS-e: pede um leitor à fábrica e chama ler().
 * Para aceitar um layout novo: criar outra subclasse de LeitorNotaFiscal e incluí-la aqui.
 */
const { HttpException } = require('../../core/HttpException');
const LeitorNfe = require('./LeitorNfe');
const LeitorNfseNacional = require('./LeitorNfseNacional');
const LeitorNfseAbrasf = require('./LeitorNfseAbrasf');

/** Ordem importa: o primeiro que reconhecer o XML é o escolhido. */
function candidatos() { return [new LeitorNfe(), new LeitorNfseNacional(), new LeitorNfseAbrasf()]; }

function criar(doc) {
  for (const leitor of candidatos()) if (leitor.reconhece(doc)) return leitor;
  throw new HttpException(400, 'Esse XML não parece ser uma NF-e nem uma NFS-e');
}

module.exports = { criar };
