const AgrupamentoDre = require('./AgrupamentoDre');

/** Strategy concreta: uma linha por centro de custo. */
class AgrupamentoPorCentroCusto extends AgrupamentoDre {
  chave() { return 'centro'; }

  rotulo() { return 'Centro de custo'; }

  item(t) { return t.centro_custo_nome || 'Sem centro de custo'; }
}

module.exports = AgrupamentoPorCentroCusto;
