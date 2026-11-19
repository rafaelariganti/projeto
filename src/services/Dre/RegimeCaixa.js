const RegimeDre = require('./RegimeDre');
const Database = require('../../core/Database');

/** Strategy concreta: caixa — só o que foi pago/recebido, pela data do pagamento. */
class RegimeCaixa extends RegimeDre {
  chave() { return 'caixa'; }

  rotulo() { return 'Caixa (só o que foi pago/recebido)'; }

  async movimentos(ano) {
    return Database.all(`SELECT tipo, COALESCE(data_pagamento, data) AS data, valor, taxa_mdr, grupo, conta_nome, categoria_nome, centro_custo_nome
                         FROM transactions WHERE status='quitado' AND YEAR(COALESCE(data_pagamento, data))=?`, [ano]);
  }
}

module.exports = RegimeCaixa;
