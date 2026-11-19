const Controller = require('../../core/Controller');
const { HttpException } = require('../../core/HttpException');
const Log = require('../../models/Log');
const { int } = require('../../helpers');

class LogController extends Controller {
  async index() {
    await this.autorizar('logs');
    const lim = Math.min(Math.max(int(this.query('limit', 50)), 1), 200);
    const pg = Math.max(int(this.query('page', 1)), 1);
    return Log.buscar({
      action: this.query('action'), entity: this.query('entity'), username: this.query('username'),
      from: this.query('from'), to: this.query('to'),
    }, pg, lim);
  }

  /** Cópia do que foi apagado/alterado (guardada junto com o log). */
  async show(id) {
    await this.autorizar('logs');
    const r = await Log.dados(int(id));
    if (!r) throw new HttpException(404, 'Registro de log não encontrado');
    return r;
  }
}

module.exports = LogController;
