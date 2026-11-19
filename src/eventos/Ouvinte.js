/** PADRÃO OBSERVER — o "observador" (interface): reage a um evento sem quem disparou saber que ele existe. */
class Ouvinte {
  /** @param {import('./Evento')} evento */
  async ouvir(evento) { throw new Error('implemente ouvir()'); } // eslint-disable-line no-unused-vars
}

module.exports = Ouvinte;
