/** Transferência entre caixas/contas. */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { mb_substr, round, num, int, float } = require('../helpers');

class Transferencia extends Model {
  static table = 'transfers';

  static async listar(ano, mes) {
    let sql = 'SELECT * FROM transfers WHERE 1=1'; const p = [];
    if (ano) { sql += ' AND YEAR(data)=?'; p.push(ano); }
    if (mes) { sql += ' AND MONTH(data)=?'; p.push(mes); }
    sql += ' ORDER BY data DESC, id DESC';
    return (await Database.all(sql, p)).map((t) => ({
      date: String(t.data).slice(0, 10), amount: float(t.valor),
      caixa_saida: t.origem_nome, caixa_entrada: t.destino_nome,
      ...t, id: int(t.id), valor: float(t.valor),
    }));
  }

  static campos(inp) {
    const g = (keys, def = '') => { for (const k of keys) if (inp[k] !== undefined && inp[k] !== null && inp[k] !== '') return inp[k]; return def; };
    const data = String(g(['date', 'data']));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new HttpException(400, 'Data inválida');
    const origem = String(g(['caixa_saida', 'origem_nome']));
    const destino = String(g(['caixa_entrada', 'destino_nome']));
    if (origem === '' || destino === '') throw new HttpException(400, 'Escolha o caixa de saída e o de entrada');
    if (origem === destino) throw new HttpException(400, 'Caixa de saída e entrada não podem ser iguais');
    const valor = round(num(g(['amount', 'valor'], 0)), 2);
    if (valor <= 0) throw new HttpException(400, 'O valor precisa ser maior que zero');
    return { data, descricao: mb_substr(String(g(['descricao', 'description'])), 0, 255), valor,
      origem_nome: origem, destino_nome: destino, observacoes: String(inp.observacoes ?? '') };
  }
}

module.exports = Transferencia;
