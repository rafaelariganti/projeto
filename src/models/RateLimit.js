/** Limite de tentativas por IP (guardado no banco: funciona com várias instâncias do servidor). */
const Model = require('../core/Model');
const Database = require('../core/Database');
const Response = require('../core/Response');
const { HttpException } = require('../core/HttpException');
const { client_ip, time, int } = require('../helpers');

const chaveDe = (chave) => (chave + ':' + client_ip()).slice(0, 190);

class RateLimit extends Model {
  static table = 'rate_limits';

  static async verificar(chave, max, janelaSeg) {
    const id = chaveDe(chave);
    const agora = time();
    const row = await Database.one('SELECT start_at, hits FROM rate_limits WHERE k=?', [id]);
    if (!row || agora - int(row.start_at) > janelaSeg) {
      await Database.run('REPLACE INTO rate_limits (k, start_at, hits) VALUES (?,?,1)', [id, agora]);
      if (Math.floor(Math.random() * 50) === 0) await Database.run('DELETE FROM rate_limits WHERE start_at < ?', [agora - 86400]);
      return;
    }
    const hits = int(row.hits) + 1;
    await Database.run('UPDATE rate_limits SET hits=? WHERE k=?', [hits, id]);
    if (hits > max) {
      const espera = Math.max(1, int(row.start_at) + janelaSeg - agora);
      Response.header('Retry-After', String(espera));
      throw new HttpException(429, 'Muitas tentativas deste computador. Aguarde ' + RateLimit.tempo(espera) + ' e tente de novo.');
    }
  }

  /** Só confere (não conta). Usado no login: quem acerta a senha não gasta tentativa. */
  static async checar(chave, max, janelaSeg) {
    const row = await Database.one('SELECT start_at, hits FROM rate_limits WHERE k=?', [chaveDe(chave)]);
    if (!row || time() - int(row.start_at) > janelaSeg || int(row.hits) < max) return;
    const espera = Math.max(1, int(row.start_at) + janelaSeg - time());
    Response.header('Retry-After', String(espera));
    throw new HttpException(429, 'Muitas tentativas erradas deste computador. Aguarde ' + RateLimit.tempo(espera) + ' e tente de novo.');
  }

  /** Conta uma tentativa errada (sem lançar erro). */
  static async contar(chave, janelaSeg) {
    const id = chaveDe(chave);
    const agora = time();
    const row = await Database.one('SELECT start_at, hits FROM rate_limits WHERE k=?', [id]);
    if (!row || agora - int(row.start_at) > janelaSeg) await Database.run('REPLACE INTO rate_limits (k, start_at, hits) VALUES (?,?,1)', [id, agora]);
    else await Database.run('UPDATE rate_limits SET hits=hits+1 WHERE k=?', [id]);
  }

  static async limpar(chave) {
    await Database.run('DELETE FROM rate_limits WHERE k=?', [chaveDe(chave)]);
  }

  static tempo(seg) {
    const min = Math.ceil(seg / 60);
    return min <= 1 ? '1 minuto' : `${min} minutos`;
  }
}

module.exports = RateLimit;
