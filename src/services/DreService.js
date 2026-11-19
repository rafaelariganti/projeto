/**
 * Cálculos do DRE, Dashboard e Fluxo de Caixa.
 * Regras da auditoria-dre.md: receita sempre LÍQUIDA (bruta − taxa MDR) nos totais,
 * fluxo de caixa realizado x previsto, transferências só entram filtrando por caixa.
 */
const Database = require('../core/Database');
const Caixa = require('../models/Caixa');
const Transacao = require('../models/Transacao');
const EstrategiasDre = require('./Dre/EstrategiasDre');
const { MESES_LONGOS, MESES_CURTOS, mes_de, dias_no_mes, round, float, int, pad } = require('../helpers');

const soma = (a) => a.reduce((s, v) => s + v, 0);
const zeros = (n) => Array(n).fill(0);
/** Objeto vazio vira [] no JSON (igual ao array associativo vazio do PHP). */
const assoc = (o) => (Object.keys(o).length ? o : []);

// ─── Dashboard ──────────────────────────────────────────────────────────────
async function dashboard(ano) {
  const txs = await Database.all('SELECT tipo, data, valor, taxa_mdr, centro_custo_nome, grupo, categoria_nome FROM transactions WHERE YEAR(data)=?', [ano]);
  const mes = {};
  for (let i = 1; i <= 12; i++) mes[i] = { r: 0, d: 0, x: 0 };
  const porCategoria = {}; const porGrupo = {}; const recCategoria = {};
  for (const t of txs) {
    const m = mes_de(t.data); const v = float(t.valor);
    if (t.tipo === 'income') {
      mes[m].r += v; mes[m].d += float(t.taxa_mdr);
      const c = t.categoria_nome || 'Sem categoria';
      recCategoria[c] = (recCategoria[c] ?? 0) + v;
    } else {
      mes[m].x += v;
      const cat = t.categoria_nome || 'Sem categoria';
      porCategoria[cat] = (porCategoria[cat] ?? 0) + v;
      const g = t.grupo || (t.centro_custo_nome || 'Outros');
      porGrupo[g] = (porGrupo[g] ?? 0) + v;
    }
  }
  const summary = MESES_LONGOS.map((nome, i) => {
    const d = mes[i + 1];
    return { month: nome, receitas: d.r, deducoes: d.d, despesas: d.x, saldo: d.r - d.d - d.x };
  });
  const bruta = soma(summary.map((s) => s.receitas));
  const ded = soma(summary.map((s) => s.deducoes));
  const desp = soma(summary.map((s) => s.despesas));
  // Donut usa categoria quando os lançamentos já têm categoria; senão cai pro grupo (comportamento antigo).
  const temCategoria = Object.keys(porCategoria).filter((k) => k !== 'Sem categoria').length > 0;
  const cores = {};
  for (const c of await Database.all('SELECT nome, cor FROM categorias')) cores[c.nome] = c.cor;
  const caixas = await Caixa.comSaldo();

  // Mesmo período do ano anterior (até o mês atual se for o ano corrente) pra comparar.
  const ateMes = ano === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
  const ant = await Database.one(`SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor-taxa_mdr END),0) rec, COALESCE(SUM(CASE WHEN tipo='expense' THEN valor END),0) desp
                                  FROM transactions WHERE YEAR(data)=? AND MONTH(data)<=?`, [ano - 1, ateMes]);
  const atu = { rec: 0, desp: 0 };
  summary.forEach((s, i) => { if (i < ateMes) { atu.rec += s.receitas - s.deducoes; atu.desp += s.despesas; } });

  return {
    summary,
    dreLines: {
      'Receita Bruta': bruta, '(-) Impostos e Deduções': ded, 'Receita Líquida': bruta - ded,
      '(-) Despesas Operacionais': desp, 'Lucro / Prejuízo Líquido': bruta - ded - desp,
    },
    expensesByCategory: assoc(temCategoria ? porCategoria : porGrupo),
    incomeByCategory: assoc(recCategoria),
    categoryColors: cores,
    year: String(ano),
    emAberto: await Transacao.resumoEmAberto(),
    saldoCaixas: soma(caixas.map((c) => c.saldo_atual)),
    caixas: caixas.map((c) => ({ nome: c.nome, tipo: c.tipo, saldo_atual: c.saldo_atual })),
    proximos: await Transacao.proximos(7, 8),
    comparativo: {
      ate_mes: ateMes,
      atual: { receita: atu.rec, despesa: atu.desp, resultado: atu.rec - atu.desp },
      anterior: { receita: float(ant.rec), despesa: float(ant.desp), resultado: float(ant.rec) - float(ant.desp) },
    },
  };
}

// ─── DRE Resumo (mensal, com saldo acumulado) ───────────────────────────────
async function resumo(ano) {
  const txs = await Database.all('SELECT tipo, data, valor, taxa_mdr FROM transactions WHERE YEAR(data)=?', [ano]);
  // Saldo inicial do ano = saldo inicial das contas + resultado de todos os anos anteriores
  const si = float(await Database.value('SELECT COALESCE(SUM(saldo_inicial),0) FROM caixas'))
    + float(await Database.value("SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor-taxa_mdr ELSE -valor END),0) FROM transactions WHERE YEAR(data)<?", [ano]));
  const mes = {};
  for (let i = 1; i <= 12; i++) mes[i] = { bruta: 0, ded: 0, desp: 0 };
  for (const t of txs) {
    const m = mes_de(t.data);
    if (t.tipo === 'income') { mes[m].bruta += float(t.valor); mes[m].ded += float(t.taxa_mdr); } else mes[m].desp += float(t.valor);
  }
  let acum = si; let totRec = 0; let totDesp = 0;
  const summary = MESES_LONGOS.map((nome, i) => {
    const d = mes[i + 1];
    const receitas = d.bruta - d.ded;
    const lucro = receitas - d.desp;
    const saldoIni = acum; acum += lucro;
    totRec += receitas; totDesp += d.desp;
    return {
      mes: nome, saldo_inicial: saldoIni, receita_bruta: d.bruta, deducoes: d.ded,
      receitas, despesas: d.desp, total: saldoIni + lucro, lucro,
      lucratividade: receitas > 0 ? lucro / receitas : 0,
    };
  });
  return {
    summary,
    totals: { receitas: totRec, despesas: totDesp, lucro: totRec - totDesp, lucratividade: totRec > 0 ? (totRec - totDesp) / totRec : 0 },
  };
}

// ─── DRE Detalhado (por grupo/conta ou categoria) ───────────────────────────
async function detalhado(ano, porCategoria) {
  const txs = await Database.all('SELECT tipo, data, valor, taxa_mdr, grupo, conta_nome, categoria_nome FROM transactions WHERE YEAR(data)=?', [ano]);
  const grupos = new Map();
  for (const t of txs) {
    let g; let c;
    if (porCategoria) { g = t.categoria_nome || 'Sem Categoria'; c = ''; } else { g = t.grupo || 'Sem Grupo'; c = t.conta_nome || 'Geral'; }
    const key = `${t.tipo}||${g}||${c}`;
    if (!grupos.has(key)) grupos.set(key, { type: t.tipo, grupo: g, conta: c, meses: zeros(12), total: 0 });
    const v = t.tipo === 'income' ? float(t.valor) - float(t.taxa_mdr) : float(t.valor);
    const it = grupos.get(key);
    it.meses[mes_de(t.data) - 1] += v;
    it.total += v;
  }
  const sort = (a, b) => b.total - a.total;
  const lista = [...grupos.values()];
  const receitas = lista.filter((g) => g.type === 'income').sort(sort);
  const despesas = lista.filter((g) => g.type === 'expense').sort(sort);
  const totR = zeros(12); const totD = zeros(12);
  for (const r of receitas) r.meses.forEach((v, i) => { totR[i] += v; });
  for (const d of despesas) d.meses.forEach((v, i) => { totD[i] += v; });
  return { meses: MESES_CURTOS, receitas, despesas, totReceita: totR, totDespesa: totD };
}

// ─── Demonstrativo completo (tela DRE) ──────────────────────────────────────
// Regime (competência/caixa) e agrupamento (categoria/grupo/centro) são Strategies:
// ver src/services/Dre/. O cálculo abaixo é o mesmo para qualquer combinação.

/** Totais anuais por item (pra comparação com o ano anterior). */
async function totaisAno(ano, regime, agrupamento) {
  const out = { receita_bruta: 0, deducoes: 0, despesas: 0, itens: {} };
  for (const t of await regime.movimentos(ano)) {
    const k = t.tipo + '|' + agrupamento.item(t);
    out.itens[k] = (out.itens[k] ?? 0) + float(t.valor);
    if (t.tipo === 'income') { out.receita_bruta += float(t.valor); out.deducoes += float(t.taxa_mdr); } else out.despesas += float(t.valor);
  }
  return out;
}

async function demonstrativo(ano, agrupar = 'categoria', regime = 'competencia') {
  const estrategiaRegime = EstrategiasDre.regime(regime);
  const estrategiaAgrup = EstrategiasDre.agrupamento(agrupar);
  regime = estrategiaRegime.chave();
  agrupar = estrategiaAgrup.chave();
  const rec = new Map(); const desp = new Map();
  const bruta = zeros(12); const ded = zeros(12); const totDesp = zeros(12);
  for (const t of await estrategiaRegime.movimentos(ano)) {
    const i = mes_de(t.data) - 1; const v = float(t.valor);
    const k = estrategiaAgrup.item(t);
    if (t.tipo === 'income') {
      if (!rec.has(k)) rec.set(k, zeros(12));
      rec.get(k)[i] += v;
      bruta[i] += v; ded[i] += float(t.taxa_mdr);
    } else {
      if (!desp.has(k)) desp.set(k, zeros(12));
      desp.get(k)[i] += v;
      totDesp[i] += v;
    }
  }
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const liq = sub(bruta, ded);
  const res = sub(liq, totDesp);
  const liqTotal = soma(liq);
  const ant = await totaisAno(ano - 1, estrategiaRegime, estrategiaAgrup);
  const antLiq = ant.receita_bruta - ant.deducoes;

  const cores = {};
  if (agrupar === 'categoria') for (const c of await Database.all('SELECT nome, cor FROM categorias')) cores[c.nome] = c.cor;

  const linha = (tipo, label, valores, anterior, extra = {}) => {
    const total = soma(valores);
    return {
      ...extra,
      tipo, label, valores: valores.map((v) => round(v, 2)), total: round(total, 2),
      av: liqTotal !== 0 ? total / liqTotal : null,
      anterior: anterior !== null ? round(anterior, 2) : null,
      ah: anterior !== null && Math.abs(anterior) > 0.004 ? (total - anterior) / Math.abs(anterior) : null,
    };
  };
  const ordena = (itens) => [...itens.entries()].sort((a, b) => soma(b[1]) - soma(a[1]));

  const linhas = [];
  linhas.push(linha('grupo', 'Receita bruta', bruta, ant.receita_bruta));
  for (const [k, vals] of ordena(rec)) linhas.push(linha('item', k, vals, ant.itens[`income|${k}`] ?? 0, { cor: cores[k] ?? null, natureza: 'income' }));
  linhas.push(linha('deducao', '(−) Taxas e deduções (MDR)', ded, ant.deducoes));
  linhas.push(linha('subtotal', 'Receita líquida', liq, antLiq));
  linhas.push(linha('grupo', '(−) Despesas', totDesp, ant.despesas));
  for (const [k, vals] of ordena(desp)) linhas.push(linha('item', k, vals, ant.itens[`expense|${k}`] ?? 0, { cor: cores[k] ?? null, natureza: 'expense' }));
  linhas.push(linha('resultado', 'Resultado líquido (lucro / prejuízo)', res, antLiq - ant.despesas));

  const margem = res.map((r, i) => (liq[i] !== 0 ? r / liq[i] : null));
  return {
    ano, agrupar, regime,
    agrupamentos: EstrategiasDre.rotulos(EstrategiasDre.agrupamentos()),
    regimes: EstrategiasDre.rotulos(EstrategiasDre.regimes()),
    meses: MESES_CURTOS, linhas,
    margem: { valores: margem, total: liqTotal !== 0 ? soma(res) / liqTotal : null },
    tem_anterior: ant.receita_bruta > 0 || ant.despesas > 0,
  };
}

// ─── Fluxo de Caixa ─────────────────────────────────────────────────────────
async function fluxoCaixa(y, m, caixa) {
  const filtra = !!caixa && caixa !== 'Todos';
  let sqlReal = `SELECT tipo, COALESCE(data_pagamento, data) d, valor FROM transactions
                 WHERE status='quitado' AND YEAR(COALESCE(data_pagamento, data))=? AND MONTH(COALESCE(data_pagamento, data))=?`;
  let sqlPrev = `SELECT tipo, COALESCE(data_vencimento, data) d, valor FROM transactions
                 WHERE status='em_aberto' AND YEAR(COALESCE(data_vencimento, data))=? AND MONTH(COALESCE(data_vencimento, data))=?`;
  let sqlTr = 'SELECT data d, valor, origem_nome, destino_nome FROM transfers WHERE YEAR(data)=? AND MONTH(data)=?';
  const pR = [y, m]; const pPrev = [y, m]; const pT = [y, m];
  if (filtra) {
    sqlReal += ' AND caixa_nome=?'; pR.push(caixa);
    sqlPrev += ' AND caixa_nome=?'; pPrev.push(caixa);
    sqlTr += ' AND (origem_nome=? OR destino_nome=?)'; pT.push(caixa, caixa);
  }
  const real = await Database.all(sqlReal, pR); const prev = await Database.all(sqlPrev, pPrev); const trs = await Database.all(sqlTr, pT);
  const si = float(filtra ? await Database.value('SELECT COALESCE(SUM(saldo_inicial),0) FROM caixas WHERE nome=?', [caixa]) : await Database.value('SELECT COALESCE(SUM(saldo_inicial),0) FROM caixas'));

  const dia = (d) => int(String(d).slice(8, 10));
  const n = dias_no_mes(m, y);
  const acc = {};
  for (let d = 1; d <= n; d++) acc[d] = { rec: 0, desp: 0, recP: 0, despP: 0, tr: 0, trIn: 0, trOut: 0 };
  for (const t of real) acc[dia(t.d)][t.tipo === 'income' ? 'rec' : 'desp'] += float(t.valor);
  for (const t of prev) acc[dia(t.d)][t.tipo === 'income' ? 'recP' : 'despP'] += float(t.valor);
  for (const t of trs) {
    const d = dia(t.d); const v = float(t.valor);
    acc[d].tr += v;
    if (filtra && t.destino_nome === caixa) acc[d].trIn += v;
    if (filtra && t.origem_nome === caixa) acc[d].trOut += v;
  }
  // Saldo de abertura = saldo inicial + tudo realizado ANTES do dia 1 (cada mês continua do anterior).
  const ini = `${pad(y, 4)}-${pad(m)}-01`;
  let sqlAnt = `SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor ELSE -valor END),0) FROM transactions
                WHERE status='quitado' AND COALESCE(data_pagamento, data) < ?`;
  const pA = [ini];
  if (filtra) { sqlAnt += ' AND caixa_nome=?'; pA.push(caixa); }
  let abertura = si + float(await Database.value(sqlAnt, pA));
  if (filtra) {
    abertura += float(await Database.value('SELECT COALESCE(SUM(valor),0) FROM transfers WHERE data < ? AND destino_nome=?', [ini, caixa]));
    abertura -= float(await Database.value('SELECT COALESCE(SUM(valor),0) FROM transfers WHERE data < ? AND origem_nome=?', [ini, caixa]));
  }
  // Projeção: além do que já aconteceu, conta o que ficou EM ABERTO com vencimento antes deste mês
  // (atrasados e, olhando um mês futuro, o que ainda vai vencer até lá) — senão a projeção fica otimista.
  let sqlPend = `SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor ELSE -valor END),0) FROM transactions
                 WHERE status='em_aberto' AND COALESCE(data_vencimento, data) < ?`;
  const pP = [ini];
  if (filtra) { sqlPend += ' AND caixa_nome=?'; pP.push(caixa); }
  const pendente = float(await Database.value(sqlPend, pP));
  let saldo = abertura; let saldoProj = abertura + pendente; const out = [];
  for (let d = 1; d <= n; d++) {
    const a = acc[d];
    const resultado = a.rec - a.desp + a.trIn - a.trOut;
    saldo += resultado;
    const previsto = a.recP - a.despP;
    saldoProj += resultado + previsto;
    out.push({
      data: `${pad(y, 4)}-${pad(m)}-${pad(d)}`, receita: a.rec, despesa: a.desp,
      transferencia: a.tr, resultado, saldo,
      receita_prevista: a.recP, despesa_prevista: a.despP, previsto, saldo_projetado: saldoProj,
    });
  }
  return { saldo_abertura: round(abertura, 2), pendente_anterior: round(pendente, 2), dias: out };
}

// ─── Relatório por forma de pagamento ───────────────────────────────────────
async function formasPagamento(y) {
  const txs = await Database.all('SELECT tipo, data, valor, forma_pagamento_nome, status FROM transactions WHERE YEAR(data)=?', [y]);
  const out = [];
  for (const fp of await Database.all('SELECT nome FROM formas_pagamento ORDER BY id')) {
    const meses = Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0, em_aberto: 0 }));
    for (const t of txs) {
      if (t.forma_pagamento_nome !== fp.nome) continue;
      const i = mes_de(t.data) - 1; const v = float(t.valor);
      meses[i][t.tipo === 'income' ? 'entradas' : 'saidas'] += v;
      if (t.status === 'em_aberto') meses[i].em_aberto += v;
    }
    const te = soma(meses.map((x) => x.entradas)); const ts = soma(meses.map((x) => x.saidas));
    if (te > 0 || ts > 0) out.push({ forma: fp.nome, meses, total_entradas: te, total_saidas: ts });
  }
  return { meses: MESES_CURTOS, formas: out };
}

module.exports = { dashboard, resumo, detalhado, demonstrativo, fluxoCaixa, formasPagamento };
