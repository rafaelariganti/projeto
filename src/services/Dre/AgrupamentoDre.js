/**
 * PADRÃO STRATEGY — agrupamento das linhas do DRE (a "interface").
 * Cada estratégia diz em qual linha (item) um lançamento entra.
 */
class AgrupamentoDre {
  chave() { throw new Error('implemente chave()'); }

  rotulo() { throw new Error('implemente rotulo()'); }

  /** Nome da linha do demonstrativo onde o lançamento é somado. */
  item(lancamento) { throw new Error('implemente item()'); } // eslint-disable-line no-unused-vars
}

module.exports = AgrupamentoDre;
