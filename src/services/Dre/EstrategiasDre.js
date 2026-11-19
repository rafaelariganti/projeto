/**
 * Catálogo das estratégias do DRE: escolhe a Strategy pelo que veio da tela
 * (?regime= e ?agrupar=) e cai no padrão quando o valor é desconhecido.
 * Para criar um agrupamento novo: uma classe que estende AgrupamentoDre + uma linha aqui.
 */
const RegimeCompetencia = require('./RegimeCompetencia');
const RegimeCaixa = require('./RegimeCaixa');
const AgrupamentoPorCategoria = require('./AgrupamentoPorCategoria');
const AgrupamentoPorGrupoConta = require('./AgrupamentoPorGrupoConta');
const AgrupamentoPorCentroCusto = require('./AgrupamentoPorCentroCusto');

/** @returns {import('./RegimeDre')[]} na ordem em que aparecem na tela */
function regimes() { return [new RegimeCompetencia(), new RegimeCaixa()]; }

/** @returns {import('./AgrupamentoDre')[]} na ordem em que aparecem na tela */
function agrupamentos() { return [new AgrupamentoPorCategoria(), new AgrupamentoPorGrupoConta(), new AgrupamentoPorCentroCusto()]; }

function regime(chave) { return regimes().find((r) => r.chave() === chave) || regimes()[0]; }

function agrupamento(chave) { return agrupamentos().find((a) => a.chave() === chave) || agrupamentos()[0]; }

/** chave => rótulo, para os seletores da tela. */
function rotulos(estrategias) {
  const out = {};
  for (const e of estrategias) out[e.chave()] = e.rotulo();
  return out;
}

module.exports = { regimes, agrupamentos, regime, agrupamento, rotulos };
