/**
 * PADRÃO STRATEGY — regime do DRE (a "interface").
 * Cada regime sabe QUAIS lançamentos entram no ano e em QUE DATA cada um conta.
 * O DreService monta o demonstrativo do mesmo jeito para qualquer regime: trocar
 * ou criar um regime novo não mexe no cálculo.
 */
class RegimeDre {
  /** Identificador usado na URL/tela (?regime=...). */
  chave() { throw new Error('implemente chave()'); }

  /** Texto mostrado no seletor da tela DRE. */
  rotulo() { throw new Error('implemente rotulo()'); }

  /** Lançamentos do ano, com a coluna "data" já sendo a data que vale para o regime. */
  async movimentos(ano) { throw new Error('implemente movimentos()'); } // eslint-disable-line no-unused-vars
}

module.exports = RegimeDre;
