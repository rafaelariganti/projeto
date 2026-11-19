const Ouvinte = require('../Ouvinte');
const Upload = require('../../services/Upload');

/** Lançamento apagado: o arquivo do comprovante vai junto (a cópia dos dados fica no log). */
class ApagarComprovante extends Ouvinte {
  async ouvir(evento) {
    await Upload.apagar(evento.dados.comprovante_path ?? null);
  }
}

module.exports = ApagarComprovante;
