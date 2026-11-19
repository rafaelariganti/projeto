/** Algo que aconteceu no sistema (nome + dados), entregue aos ouvintes pelo Despachante. */
class Evento {
  static LANCAMENTO_CRIADO = 'lancamento.criado';
  static LANCAMENTO_APAGADO = 'lancamento.apagado';

  constructor(nome, dados = {}) {
    this.nome = nome;
    this.dados = dados;
  }
}

module.exports = Evento;
