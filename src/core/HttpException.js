/** Erro com status HTTP. Lançado por controllers/models; o App transforma em resposta. */
class HttpException extends Error {
  constructor(status, msg, codigo = null) {
    super(msg);
    this.status = status;
    this.codigo = codigo;
  }
}

/** Sinal interno: a resposta já foi enviada (equivale ao exit do PHP). */
class Encerrar extends Error {
  constructor() { super('resposta enviada'); this.encerrar = true; }
}

module.exports = { HttpException, Encerrar };
