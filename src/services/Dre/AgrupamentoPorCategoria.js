const AgrupamentoDre = require('./AgrupamentoDre');

/** Strategy concreta: uma linha por categoria. */
class AgrupamentoPorCategoria extends AgrupamentoDre {
  chave() { return 'categoria'; }

  rotulo() { return 'Categoria'; }

  item(t) { return t.categoria_nome || 'Sem categoria'; }
}

module.exports = AgrupamentoPorCategoria;
