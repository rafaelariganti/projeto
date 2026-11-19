const Ouvinte = require('../Ouvinte');
const NotaFiscal = require('../../models/NotaFiscal');
const { int } = require('../../helpers');

/** Lançamento apagado: a nota fiscal continua guardada, só perde o vínculo. */
class DesvincularNotasFiscais extends Ouvinte {
  async ouvir(evento) {
    await NotaFiscal.desvincularLancamento(int(evento.dados.id));
  }
}

module.exports = DesvincularNotasFiscais;
