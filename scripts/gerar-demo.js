/**
 * Gera demo/dados.json.gz — as respostas da API usadas pelo MODO DEMONSTRAÇÃO (DEMO=1).
 *
 * Roda contra o sistema de verdade, ligado e com os dados fictícios:
 *   npm run dados                      (num banco de teste)
 *   npm start                          (em outro terminal)
 *   node scripts/gerar-demo.js         (BASE_URL=http://localhost:3000, usuário admin / Admin1234)
 *
 * Listas grandes (lançamentos, notas, logs) são guardadas inteiras e filtradas na hora, no próprio modo demo.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const USER = process.env.DEMO_USER || 'admin';
const PASS = process.env.DEMO_PASS || 'Admin1234';
const ANOS = [2024, 2025, 2026, 2027];
let cookie = '';

async function req(caminho, { method = 'GET', body = null, bin = false } = {}) {
  const r = await fetch(BASE + '/' + caminho, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  if (bin) return { status: r.status, mime: r.headers.get('content-type'), disp: r.headers.get('content-disposition'), b64: Buffer.from(await r.arrayBuffer()).toString('base64') };
  return { status: r.status, json: await r.json() };
}

/** Mesma normalização do src/demo/Demo.js: parâmetros vazios saem e o resto vai em ordem alfabética. */
function chave(p) {
  const [base, q = ''] = p.split('?');
  const qs = [...new URLSearchParams(q).entries()].filter(([, v]) => v !== '').sort(([a], [b]) => a.localeCompare(b));
  return base + (qs.length ? '?' + new URLSearchParams(qs).toString() : '');
}

(async () => {
  const login = await req('api/auth/login', { method: 'POST', body: { username: USER, password: PASS } });
  if (login.status !== 200) throw new Error('Login falhou: ' + JSON.stringify(login.json));
  const out = { gerado_em: new Date().toISOString(), usuario: login.json, json: {}, bin: {} };
  delete out.usuario.csrf;
  const pega = async (p) => { const r = await req('api/' + p); if (r.status === 200) out.json[chave(p)] = r.json; return r.json; };
  const pegaBin = async (p) => { const r = await req('api/' + p, { bin: true }); if (r.status === 200) out.bin[chave(p)] = { mime: r.mime, disp: r.disp, b64: r.b64 }; };

  for (const p of ['cadastros', 'caixas', 'clientes', 'fornecedores', 'parceiros', 'formas_pagamento', 'users', 'perfis', 'importacao',
    'contas_receita', 'contas_despesa', 'centros_custo', 'transactions/em-aberto', 'categorias']) await pega(p);

  // Listas completas (o modo demo filtra)
  out.json['@transactions'] = (await req('api/transactions')).json;
  out.json['@notas'] = (await req('api/notas-fiscais')).json;
  out.json['@logs'] = (await req('api/logs?limit=200')).json.rows;

  const caixas = (await req('api/caixas')).json.caixas.map((c) => c.nome);
  for (const y of ANOS) {
    for (const p of [`dre?year=${y}`, `dre/resumo?year=${y}`, `dre/detalhado?year=${y}`, `dre/detalhado?year=${y}&agrupar=categoria`,
      `dre/formas-pagamento?year=${y}`, `transfers?year=${y}`, `categorias?year=${y}`]) await pega(p);
    for (const r of ['competencia', 'caixa']) for (const a of ['categoria', 'grupo', 'centro']) await pega(`dre/demonstrativo?year=${y}&agrupar=${a}&regime=${r}`);
    for (let m = 1; m <= 12; m++) {
      await pega(`agenda?year=${y}&month=${m}`);
      await pega(`transfers?year=${y}&month=${m}`);
      for (const c of ['', ...caixas]) await pega(`dre/fluxo-caixa?year=${y}&month=${m}${c ? '&caixa=' + encodeURIComponent(c) : ''}`);
    }
  }
  for (const nf of out.json['@notas']) {
    await pega(`notas-fiscais/${nf.id}`);
    await pega(`notas-fiscais/${nf.id}/lancamento`);
    await pega(`notas-fiscais/${nf.id}/candidatos?so_aberto=0`);
    await pega(`notas-fiscais/${nf.id}/candidatos?so_aberto=1`);
    if (nf.tem_xml) { await pega(`notas-fiscais/${nf.id}/xml`); await pegaBin(`notas-fiscais/${nf.id}/arquivo/xml`); }
    if (nf.tem_pdf) await pegaBin(`notas-fiscais/${nf.id}/arquivo/pdf`);
  }
  for (const l of out.json['@logs']) if (l.tem_dados) await pega(`logs/${l.id}`);
  for (const p of (await req('api/parceiros')).json) await pega(`documentos?parceiro_id=${p.id}&tipo=contrato_parceiro`);
  for (const f of (await req('api/fornecedores')).json) await pega(`documentos?fornecedor_id=${f.id}&tipo=contrato_fornecedor`);
  for (const y of [2025, 2026]) for (const e of ['excel', 'csv', 'xml', 'pdf', 'dre-excel']) await pegaBin(`export/${e}?year=${y}`);
  for (const t of ['lancamentos', 'clientes', 'fornecedores']) for (const f of ['xlsx', 'csv']) await pegaBin(`importacao/modelo?formato=${f}&tipo=${t}`);

  const destino = path.join(__dirname, '..', 'demo', 'dados.json.gz');
  fs.writeFileSync(destino, zlib.gzipSync(JSON.stringify(out), { level: 9 }));
  console.log(`demo/dados.json.gz: ${Object.keys(out.json).length} respostas JSON, ${Object.keys(out.bin).length} arquivos, ${(fs.statSync(destino).size / 1048576).toFixed(1)} MB`);
})().catch((e) => { console.error(e.message); process.exit(1); });
