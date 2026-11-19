/**
 * Cadastros simples (plano de contas e centros de custo): uma tabela, poucas colunas.
 * Só entram colunas da lista — nada do JSON vira nome de coluna.
 */
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, empty, int } = require('../helpers');

/** tabela => [colunas, obrigatórias] */
const TABELAS = {
  contas_receita: [['grupo', 'conta'], ['grupo']],
  contas_despesa: [['grupo', 'conta'], ['grupo']],
  centros_custo: [['nome'], ['nome']],
};

async function listar(t) {
  return (await Database.all(`SELECT * FROM \`${t}\` ORDER BY id`)).map((r) => ({ ...r, id: int(r.id) }));
}

function campos(t, inp, parcial) {
  const [cols, obrig] = TABELAS[t];
  const out = {};
  for (const c of cols) {
    if (!Object.prototype.hasOwnProperty.call(inp, c)) { if (!parcial) out[c] = null; continue; }
    out[c] = cut(str_or_null(inp[c]), 150);
  }
  for (const r of obrig) if ((parcial ? r in out : true) && empty(out[r])) throw new HttpException(400, `Campo obrigatório: ${r}`);
  return out;
}

async function criar(t, d) {
  const c = Object.keys(d);
  return Database.insert(`INSERT INTO \`${t}\` (\`${c.join('`,`')}\`) VALUES (${c.map(() => '?').join(',')})`, Object.values(d));
}

async function atualizar(t, id, d) {
  const c = Object.keys(d);
  if (!c.length) return;
  await Database.run(`UPDATE \`${t}\` SET ${c.map((x) => `\`${x}\`=?`).join(',')} WHERE id=?`, [...Object.values(d), id]);
}

async function find(t, id) { return Database.one(`SELECT * FROM \`${t}\` WHERE id=?`, [id]); }
async function apagar(t, id) { await Database.run(`DELETE FROM \`${t}\` WHERE id=?`, [id]); }

module.exports = { TABELAS, listar, campos, criar, atualizar, find, apagar };
