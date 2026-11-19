/** Base dos Controllers: autorização, leitura da requisição e log. */
const Auth = require('./Auth');
const Request = require('./Request');
const { HttpException } = require('./HttpException');

class Controller {
  /** Exige pelo menos "ver" em uma das telas. */
  async autorizar(...telas) {
    const u = await Auth.exigir();
    if (!Auth.pode(...telas)) throw new HttpException(403, 'Sem permissão de acesso a esta tela');
    return u;
  }

  /** Exige "editar" na tela (criar/alterar/apagar). */
  async autorizarEdicao(tela) {
    const u = await Auth.exigir();
    if (!Auth.podeEditar(tela)) {
      throw new HttpException(403, Auth.pode(tela) ? 'Seu nível de acesso permite só consultar esta tela' : 'Sem permissão de acesso a esta tela');
    }
    return u;
  }

  async somenteAdmin() {
    const u = await Auth.exigir();
    if (!Auth.isAdmin()) throw new HttpException(403, 'Acesso restrito a administradores');
    return u;
  }

  input(k, def = null) { return Request.input(k, def); }
  query(k, def = null) { return Request.query(k, def); }
  body() { return Request.body(); }

  falhar(status, msg) { throw new HttpException(status, msg); }

  /** dados = cópia do registro (nas exclusões guarda o que foi apagado). */
  async log(acao, entidade, id = null, detalhes = null, username = null, dados = null) {
    await require('../models/Log').registrar(acao, entidade, id, detalhes, username, dados);
  }
}

module.exports = Controller;
