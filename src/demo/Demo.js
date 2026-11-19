/**
 * MODO DEMONSTRAÇÃO (DEMO=1): o sistema roda SEM banco de dados, só pra mostrar as telas.
 *
 * - O login aceita qualquer coisa e entra como administrador de demonstração.
 * - Todas as telas mostram os dados fictícios da clínica (respostas guardadas em demo/dados.json.gz,
 *   geradas pelo scripts/gerar-demo.js a partir do sistema de verdade).
 * - Criar, editar, apagar, importar e enviar arquivo ficam bloqueados com um aviso.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const config = require('../bootstrap');
const { ctx } = require('../core/Context');
const { HttpException } = require('../core/HttpException');
const { int, only_digits } = require('../helpers');

const COOKIE = 'dre_demo';
const AVISO = 'Modo demonstração: aqui é só pra visualizar, nada é salvo.';
let dados = null;

function carregar() {
  if (dados) return dados;
  const arq = path.join(config.ROOT_DIR, 'demo', 'dados.json.gz');
  dados = JSON.parse(zlib.gunzipSync(fs.readFileSync(arq)).toString('utf8'));
  return dados;
}

/** Mesma normalização do gerador: parâmetros vazios saem e o resto vai em ordem alfabética. */
function chave(caminho, query) {
  const qs = Object.entries(query || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null && !Array.isArray(v))
    .map(([k, v]) => [k, String(v)]).sort(([a], [b]) => a.localeCompare(b));
  return caminho + (qs.length ? '?' + new URLSearchParams(qs).toString() : '');
}

// ─── Login de mentira (cookie, sem sessão no banco) ─────────────────────────
function logado() {
  const c = String(ctx()?.req?.headers?.cookie || '');
  return c.split(/;\s*/).includes(`${COOKIE}=1`);
}

function usuario() {
  const u = carregar().usuario;
  // Formato do banco (o Auth monta o resto a partir disso)
  return {
    id: u.id, username: 'demo', nome: 'Visitante (demonstração)', email: null, password: '', ativo: 1,
    is_admin: 1, role: 'admin', perfil_id: u.perfil_id, perfil_nome: 'Administrador', perfil_permissoes: null,
    deve_trocar_senha: 0, termos_versao: require('../core/Termos').VERSAO, termos_aceitos_em: null,
    cargo: null, setor: null, telefone: null, ramal: null, whatsapp: null, foto_path: null, senha_alterada_em: null,
  };
}

function entrar() {
  ctx().res.setHeader('Set-Cookie', `${COOKIE}=1; Path=/; HttpOnly; SameSite=Strict${ctx().req.secure ? '; Secure' : ''}`);
  const c = ctx(); c.user = usuario(); c.authCarregado = true;
}

function sair() {
  ctx().res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

// ─── Listas filtradas na hora ───────────────────────────────────────────────
function transacoes(q) {
  return carregar().json['@transactions'].filter((t) => {
    if (q.year && int(String(t.data).slice(0, 4)) !== int(q.year)) return false;
    if (q.month && int(String(t.data).slice(5, 7)) !== int(q.month)) return false;
    if (q.type && t.tipo !== q.type) return false;
    if (q.status && t.status !== q.status) return false;
    if (q.categoria_id && int(t.categoria_id) !== int(q.categoria_id)) return false;
    if (q.centro_custo && t.centro_custo_nome !== q.centro_custo) return false;
    if (q.forma_pagamento && t.forma_pagamento_nome !== q.forma_pagamento) return false;
    if (q.caixa_banco && t.caixa_nome !== q.caixa_banco) return false;
    if (q.importacao_id && int(t.importacao_id) !== int(q.importacao_id)) return false;
    return true;
  });
}

function notas(q) {
  const busca = String(q.busca || '').trim().toLowerCase();
  const dig = only_digits(busca);
  return carregar().json['@notas'].filter((n) => {
    const ref = String(n.data_emissao || n.created_at || '');
    if (q.tipo && n.tipo !== q.tipo) return false;
    if (q.vinculo === 'com' && !n.transaction_id) return false;
    if (q.vinculo === 'sem' && n.transaction_id) return false;
    if (q.year && int(ref.slice(0, 4)) !== int(q.year)) return false;
    if (q.month && int(ref.slice(5, 7)) !== int(q.month)) return false;
    if (q.transaction_id && int(n.transaction_id) !== int(q.transaction_id)) return false;
    if (busca) {
      const txt = [n.numero, n.emitente_nome, n.destinatario_nome, n.descricao, n.chave].map((x) => String(x || '').toLowerCase());
      const docs = [n.emitente_doc, n.destinatario_doc].map((x) => String(x || ''));
      if (!txt.some((x) => x.includes(busca)) && !(dig && docs.some((x) => x.includes(dig)))) return false;
    }
    return true;
  });
}

function logs(q) {
  const limite = Math.min(Math.max(int(q.limit || 50), 1), 200);
  const pagina = Math.max(int(q.page || 1), 1);
  const rows = carregar().json['@logs'].filter((l) => {
    if (q.action && l.action !== q.action) return false;
    if (q.entity && l.entity !== q.entity) return false;
    if (q.username && !String(l.username || '').toLowerCase().includes(String(q.username).toLowerCase())) return false;
    if (q.from && String(l.created_at) < q.from) return false;
    if (q.to && String(l.created_at) > q.to + ' 23:59:59') return false;
    return true;
  });
  return { rows: rows.slice((pagina - 1) * limite, pagina * limite), total: rows.length, page: pagina, limit: limite, pages: Math.max(Math.ceil(rows.length / limite), 1) };
}

/**
 * Responde uma chamada /api/* no modo demo.
 * Devolve { json } ou { arquivo: {mime, disp, conteudo} }; lança HttpException quando não dá.
 */
function responder(method, caminho, query) {
  const d = carregar();
  const rota = caminho.replace(/^api\//, '');

  // Login / saída: sempre funciona, sem senha.
  if (rota === 'auth/login' && method === 'POST') { entrar(); return { json: { ...require('../core/Auth').out(), csrf: 'demo' } }; }
  if (rota === 'auth/logout') { sair(); return { json: { ok: true } }; }
  if (rota === 'auth/setup-status') return { json: { needsSetup: false, version: config.APP_VERSION, demo: true } };

  if (!logado()) throw new HttpException(401, 'Não autenticado');
  if (rota === 'auth/me') return { json: { ...require('../core/Auth').out(), csrf: 'demo' } };
  if (method !== 'GET') throw new HttpException(403, AVISO, 'DEMO');

  if (rota === 'transactions') return { json: transacoes(query) };
  if (rota === 'notas-fiscais') return { json: notas(query) };
  if (rota === 'logs') return { json: logs(query) };

  const k = chave(rota, query);
  if (d.bin[k] || d.bin[chave(rota, { ...query, download: '' })]) {
    const b = d.bin[k] || d.bin[chave(rota, { ...query, download: '' })];
    let disp = b.disp || '';
    if (query.download === '1') disp = disp.replace(/^inline/, 'attachment');
    return { arquivo: { mime: b.mime, disp, conteudo: Buffer.from(b.b64, 'base64') } };
  }
  if (d.json[k] !== undefined) return { json: d.json[k] };
  // Mesmo caminho sem os filtros (ex.: candidatos com texto de busca)
  if (d.json[rota] !== undefined) return { json: d.json[rota] };
  // Ano sem dados guardados: usa o mais parecido que existir (2026)
  if (query.year) {
    const alt = chave(rota, { ...query, year: '2026' });
    if (d.json[alt] !== undefined) return { json: d.json[alt] };
  }
  if (/\/comprovante$|\/arquivo\//.test(rota) || rota.startsWith('export/') || rota.startsWith('importacao/modelo')) {
    throw new HttpException(404, 'Arquivo não disponível na demonstração');
  }
  return { json: [] };
}

module.exports = { AVISO, logado, usuario, responder };
