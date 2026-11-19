/**
 * PADRÃO OBSERVER — o "sujeito": guarda quem quer ouvir cada evento e avisa todos quando ele acontece.
 * Os controllers só disparam ("lançamento apagado"); o que fazer depois fica nos Ouvintes
 * registrados em src/eventos.js. Assim, uma reação nova não exige mexer no controller.
 */
/** @type {Record<string, import('./Ouvinte')[]>} */
const ouvintes = {};
let configurado = false;

function ouvir(evento, ouvinte) {
  (ouvintes[evento] = ouvintes[evento] || []).push(ouvinte);
}

/** Carrega a lista de ouvintes (src/eventos.js) só na primeira vez. */
function configurar() {
  if (configurado) return;
  configurado = true;
  require('../eventos');
}

/** Avisa os ouvintes na ordem em que foram registrados. */
async function disparar(evento) {
  configurar();
  for (const o of ouvintes[evento.nome] ?? []) await o.ouvir(evento);
}

module.exports = { ouvir, disparar };
