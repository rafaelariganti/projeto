const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, empty, int, float } = require('../helpers');

class Categoria extends Model {
  static table = 'categorias';

  /** Lista com o uso no ano (quantos lançamentos e quanto movimentou). */
  static async listar(ano) {
    const rows = await Database.all(`SELECT c.*,
          COALESCE(SUM(CASE WHEN YEAR(t.data)=? THEN 1 ELSE 0 END),0) AS qtd_ano,
          COALESCE(SUM(CASE WHEN YEAR(t.data)=? THEN t.valor ELSE 0 END),0) AS total_ano,
          COUNT(t.id) AS qtd_total
        FROM categorias c LEFT JOIN transactions t ON t.categoria_id = c.id
        GROUP BY c.id ORDER BY c.ativo DESC, c.tipo, c.nome`, [ano, ano]);
    return rows.map((r) => ({ ...r, id: int(r.id), ativo: int(r.ativo), qtd_ano: int(r.qtd_ano), total_ano: float(r.total_ano), qtd_total: int(r.qtd_total) }));
  }

  static async ativas() {
    return (await Database.all('SELECT id, nome, tipo, cor FROM categorias WHERE ativo=1 ORDER BY nome')).map((c) => ({ ...c, id: int(c.id) }));
  }

  static campos(inp) {
    const nome = String(inp.nome ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Campo obrigatório: nome');
    const tipo = inp.tipo ?? 'ambos';
    if (!['income', 'expense', 'ambos'].includes(tipo)) throw new HttpException(400, 'Tipo inválido');
    let cor = String(inp.cor ?? '#1F5FBF');
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) cor = '#1F5FBF';
    return {
      nome: mb_substr(nome, 0, 150), tipo, cor: cor.toUpperCase(),
      descricao: cut(str_or_null(inp.descricao ?? null), 255),
      ativo: !empty(inp.ativo) || !Object.prototype.hasOwnProperty.call(inp, 'ativo') ? 1 : 0,
    };
  }

  static async duplicada(nome, tipo, ignorar = null) {
    return !!(ignorar
      ? await Database.one('SELECT id FROM categorias WHERE nome=? AND tipo=? AND id<>?', [nome, tipo, ignorar])
      : await Database.one('SELECT id FROM categorias WHERE nome=? AND tipo=?', [nome, tipo]));
  }

  /** Acha pelo nome (sem diferenciar maiúsculas/acentos via collation) aceitando o tipo do lançamento. */
  static async porNome(nome, tipo) {
    return Database.one("SELECT id, nome, tipo FROM categorias WHERE nome=? AND (tipo=? OR tipo='ambos') ORDER BY tipo=? DESC LIMIT 1", [nome, tipo, tipo]);
  }
}

module.exports = Categoria;
