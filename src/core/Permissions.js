/**
 * Catálogo das telas do sistema — fonte única usada pelo menu lateral, pela
 * tela de Níveis de acesso e pelo bloqueio no servidor.
 *
 * Cada nível de acesso (tabela `perfis`) guarda, por tela, um destes valores:
 *   0 = sem acesso · 1 = ver (só consulta) · 2 = editar (criar, alterar, apagar)
 * O perfil marcado como administrador tem 2 em tudo e ainda gerencia usuários.
 */
const { int } = require('../helpers');

const NENHUM = 0;
const VER = 1;
const EDITAR = 2;

/** chave => [rótulo, grupo, rota, aceita "editar"?, descrição do que "editar" libera] */
const TELAS = {
  'dashboard':        ['Dashboard', 'Visão geral', 'dashboard', false, ''],
  'dre':              ['DRE', 'Visão geral', 'dre', false, ''],
  'calendario':       ['Calendário', 'Visão geral', 'calendario', false, ''],
  'lancamentos':      ['Lançamentos', 'Financeiro', 'lancamentos', true, 'criar, editar, dar baixa e apagar lançamentos e transferências'],
  'notas-fiscais':    ['Notas fiscais', 'Financeiro', 'notas-fiscais', true, 'anexar, substituir, vincular e remover notas fiscais (PDF/XML)'],
  'fluxo-caixa':      ['Fluxo de Caixa', 'Financeiro', 'fluxo-caixa', false, ''],
  'importacao':       ['Importar / Exportar', 'Financeiro', 'importacao', true, 'importar planilhas e desfazer importações (ver = só exportar)'],
  'cad-clientes':     ['Clientes', 'Cadastros', 'clientes', true, 'cadastrar, editar e apagar'],
  'cad-fornecedores': ['Fornecedores', 'Cadastros', 'fornecedores', true, 'cadastrar, editar, anexar contratos e apagar'],
  'cad-parceiros':    ['Parceiros', 'Cadastros', 'parceiros', true, 'cadastrar, editar, anexar contratos e apagar'],
  'cad-categorias':   ['Categorias', 'Cadastros', 'categorias', true, 'cadastrar, editar, ativar/desativar e apagar'],
  'cad-caixas':       ['Caixas / Banco', 'Cadastros', 'caixas', true, 'cadastrar, editar e apagar contas'],
  'cad-formas':       ['Formas de pagamento', 'Cadastros', 'formas', true, 'cadastrar, editar e apagar formas'],
  'logs':             ['Logs', 'Sistema', 'logs', false, ''],
};

/** Rota (URL) → chave da tela. Usuários é só de administrador. */
function telaDaRota(rota) {
  for (const [k, t] of Object.entries(TELAS)) if (t[2] === rota) return k;
  return null;
}

function chaves() { return Object.keys(TELAS); }

/** Normaliza o que vem do formulário/banco: só chaves conhecidas, níveis 0..2. */
function normalizar(perms) {
  if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = null; } }
  if (!perms || typeof perms !== 'object') perms = {};
  const out = {};
  for (const [k, t] of Object.entries(TELAS)) {
    let n = int(perms[k] ?? 0);
    if (!t[3] && n > VER) n = VER; // tela só de consulta
    out[k] = Math.max(0, Math.min(2, n));
  }
  return out;
}

function todas(nivel = EDITAR) {
  const p = {};
  for (const k of chaves()) p[k] = nivel;
  return normalizar(p);
}

/** Catálogo pro front (tela de níveis de acesso). */
function catalogo() {
  return Object.entries(TELAS).map(([k, [label, grupo, rota, editavel, desc]]) => ({ chave: k, label, grupo, rota, editavel, editar_desc: desc }));
}

module.exports = { NENHUM, VER, EDITAR, TELAS, telaDaRota, chaves, normalizar, todas, catalogo };
