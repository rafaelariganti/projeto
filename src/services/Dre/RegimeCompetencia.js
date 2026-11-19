const RegimeDre = require('./RegimeDre');
const Database = require('../../core/Database');

/** Strategy concreta: competência — tudo pela data do lançamento, pago ou não. */
class RegimeCompetencia extends RegimeDre {
  chave() { return 'competencia'; }

  rotulo() { return 'Competência (data do lançamento)'; }

  async movimentos(ano) {
    return Database.all('SELECT tipo, data, valor, taxa_mdr, grupo, conta_nome, categoria_nome, centro_custo_nome FROM transactions WHERE YEAR(data)=?', [ano]);
  }
}

module.exports = RegimeCompetencia;
