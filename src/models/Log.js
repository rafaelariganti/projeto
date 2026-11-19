/** Histórico de atividades (quem, quando, o quê, IP). */
const Model = require('../core/Model');
const Database = require('../core/Database');
const Logger = require('../core/Logger');
const { client_ip, mb_substr, int } = require('../helpers');

/** Campos que nunca vão pro snapshot (senha, tokens). */
const OCULTAR = ['password', 'token_hash', 'permissoes'];

class Log extends Model {
  static table = 'logs';

  /**
   * Nunca derruba a requisição principal: se falhar, só registra no log da aplicação.
   * dados = cópia do registro (ex.: o que foi apagado), guardada em JSON pra consulta na tela de Logs.
   */
  static async registrar(acao, entidade, id = null, detalhes = null, username = null, dados = null) {
    const u = require('../core/Auth').atual();
    // Espelha a atividade no log da aplicação (CloudWatch). Só ação/entidade/id — nunca o snapshot.
    Logger[acao === 'login_failed' ? 'warn' : 'info']('Operação: ' + acao, { acao, entidade, entidade_id: id, usuario: username ?? (u?.username ?? null) });
    try {
      await Database.run(
        'INSERT INTO logs (user_id, username, action, entity, entity_id, details, ip, dados) VALUES (?,?,?,?,?,?,?,?)',
        [u?.id ?? null, username ?? (u?.username ?? null), acao, entidade,
          id !== null && id !== undefined ? int(id) : null,
          detalhes !== null && detalhes !== undefined ? mb_substr(String(detalhes), 0, 500) : null, client_ip(),
          dados !== null && dados !== undefined ? Log.snapshot(dados) : null],
      );
    } catch (e) { Logger.warn('Falha ao gravar log de atividade', { erro: e.message }); }
  }

  /** JSON do registro sem campos sensíveis (aceita um registro ou uma lista deles). */
  static snapshot(dados) {
    const limpa = (r) => { const c = { ...r }; for (const k of OCULTAR) delete c[k]; return c; };
    const lista = Array.isArray(dados) ? (dados.length && dados[0] && typeof dados[0] === 'object' ? dados.map(limpa) : dados) : limpa(dados);
    let json;
    try { json = JSON.stringify(lista); } catch { json = '{}'; }
    return mb_substr(json, 0, 4000000);
  }

  /** Snapshot de um log (tela de Logs → "Ver dados apagados"). */
  static async dados(id) {
    const r = await Database.one('SELECT id, action, entity, entity_id, details, username, created_at, dados FROM logs WHERE id=?', [id]);
    if (!r) return null;
    r.id = int(r.id);
    try { r.dados = r.dados !== null ? JSON.parse(String(r.dados)) : null; } catch { r.dados = null; }
    return r;
  }

  static async buscar(f, pagina, limite) {
    let where = ' WHERE 1=1'; const p = [];
    if (f.action) { where += ' AND action=?'; p.push(f.action); }
    if (f.entity) { where += ' AND entity=?'; p.push(f.entity); }
    if (f.username) { where += ' AND username LIKE ?'; p.push('%' + f.username + '%'); }
    if (f.from) { where += ' AND created_at>=?'; p.push(f.from); }
    if (f.to) { where += ' AND created_at<=?'; p.push(f.to + ' 23:59:59'); }
    const n = int(await Database.value(`SELECT COUNT(*) FROM logs${where}`, p));
    const rows = (await Database.all(`SELECT id, user_id, username, action, entity, entity_id, details, ip, created_at, (dados IS NOT NULL) AS tem_dados
        FROM logs${where} ORDER BY id DESC LIMIT ${int(limite)} OFFSET ${(int(pagina) - 1) * int(limite)}`, p))
      .map((r) => ({ ...r, id: int(r.id), entity_id: r.entity_id !== null ? int(r.entity_id) : null, tem_dados: !!r.tem_dados }));
    return { rows, total: n, page: pagina, limit: limite, pages: Math.max(Math.ceil(n / limite), 1) };
  }
}

module.exports = Log;
