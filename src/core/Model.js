/**
 * Base dos Models: cada Model representa uma tabela e concentra o SQL dela
 * (os Controllers não escrevem SQL). Os atalhos abaixo cobrem o CRUD comum.
 */
const Database = require('./Database');
const { HttpException } = require('./HttpException');

class Model {
  /** Nome da tabela — definido em cada Model (static table = '...'). */
  static table = '';

  static async find(id) {
    return Database.one('SELECT * FROM `' + this.table + '` WHERE id=?', [Number(id) || 0]);
  }

  static async findOrFail(id, msg = 'Registro não encontrado') {
    const row = await this.find(id);
    if (!row) throw new HttpException(404, msg);
    return row;
  }

  /** INSERT a partir de um objeto coluna => valor. */
  static async create(data) {
    const cols = Object.keys(data);
    const sql = 'INSERT INTO `' + this.table + '` (`' + cols.join('`,`') + '`) VALUES (' + cols.map(() => '?').join(',') + ')';
    return Database.insert(sql, Object.values(data));
  }

  /** UPDATE de um registro a partir de um objeto coluna => valor. */
  static async update(id, data) {
    const cols = Object.keys(data);
    if (!cols.length) return 0;
    const set = cols.map((c) => '`' + c + '`=?').join(',');
    return Database.run('UPDATE `' + this.table + '` SET ' + set + ' WHERE id=?', [...Object.values(data), id]);
  }

  static async delete(id) {
    return Database.run('DELETE FROM `' + this.table + '` WHERE id=?', [id]);
  }

  static async count(where = '1=1', params = []) {
    return Number(await Database.value('SELECT COUNT(*) FROM `' + this.table + '` WHERE ' + where, params)) || 0;
  }
}

module.exports = Model;
