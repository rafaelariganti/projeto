/** Histórico de importações de planilha. */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { int, float } = require('../helpers');

class Importacao extends Model {
  static table = 'importacoes';

  /** Tabela onde ficam os registros criados por cada tipo de importação. */
  static TABELA_DO_TIPO = { lancamentos: 'transactions', clientes: 'clientes', fornecedores: 'fornecedores' };

  static async listar(limite = 50) {
    const rows = await Database.all(`SELECT * FROM importacoes ORDER BY id DESC LIMIT ${int(limite)}`);
    const out = [];
    for (const r of rows) {
      const tab = Importacao.TABELA_DO_TIPO[r.tipo] ?? null;
      const restantes = tab && !r.desfeita_em ? int(await Database.value(`SELECT COUNT(*) FROM \`${tab}\` WHERE importacao_id=?`, [r.id])) : 0;
      out.push({ ...r, id: int(r.id), total_linhas: int(r.total_linhas), importados: int(r.importados), ignorados: int(r.ignorados), valor_total: float(r.valor_total), restantes });
    }
    return out;
  }

  /** Registros que a importação criou (cópia guardada no log antes de desfazer). */
  static async registros(imp) {
    const tab = Importacao.TABELA_DO_TIPO[imp.tipo] ?? null;
    return tab ? Database.all(`SELECT * FROM \`${tab}\` WHERE importacao_id=? ORDER BY id`, [imp.id]) : [];
  }

  /** Apaga o que essa importação criou. Devolve quantos registros saíram. */
  static async desfazer(imp) {
    const tab = Importacao.TABELA_DO_TIPO[imp.tipo] ?? null;
    if (!tab) return 0;
    const Upload = require('../services/Upload');
    return Database.transaction(async () => {
      if (tab === 'transactions') for (const c of await Database.all('SELECT comprovante_path FROM transactions WHERE importacao_id=? AND comprovante_path IS NOT NULL', [imp.id])) Upload.apagar(c.comprovante_path);
      if (tab === 'transactions') await Database.run('UPDATE notas_fiscais SET transaction_id=NULL WHERE transaction_id IN (SELECT id FROM transactions WHERE importacao_id=?)', [imp.id]);
      const n = await Database.run(`DELETE FROM \`${tab}\` WHERE importacao_id=?`, [imp.id]);
      await Database.run('UPDATE importacoes SET desfeita_em=NOW() WHERE id=?', [imp.id]);
      return n;
    });
  }
}

module.exports = Importacao;
