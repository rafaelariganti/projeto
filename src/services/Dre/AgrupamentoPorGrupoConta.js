const AgrupamentoDre = require('./AgrupamentoDre');

/** Strategy concreta: uma linha por grupo do plano de contas (+ conta, quando tem). */
class AgrupamentoPorGrupoConta extends AgrupamentoDre {
  chave() { return 'grupo'; }

  rotulo() { return 'Grupo / conta'; }

  item(t) {
    return ((t.grupo || 'Sem grupo') + (t.conta_nome ? ' — ' + t.conta_nome : '')).trim();
  }
}

module.exports = AgrupamentoPorGrupoConta;
