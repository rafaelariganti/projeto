/**
 * Importação de planilhas em 3 passos:
 *   1. analisar  — lê o arquivo, guarda as linhas em storage/imports/<token>.json e sugere o mapeamento das colunas
 *   2. validar   — aplica mapeamento + opções e devolve a prévia linha a linha (ok / aviso / erro / duplicado)
 *   3. confirmar — grava as linhas válidas numa transação e registra a importação (dá pra desfazer depois)
 */
const path = require('path');
const crypto = require('crypto');
const Auth = require('../core/Auth');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const Categoria = require('../models/Categoria');
const Cliente = require('../models/Cliente');
const Fornecedor = require('../models/Fornecedor');
const Importacao = require('../models/Importacao');
const Transacao = require('../models/Transacao');
const PlanilhaReader = require('./Spreadsheet/PlanilhaReader');
const XlsxWriter = require('./Spreadsheet/XlsxWriter');
const Armazenamento = require('./Armazenamento');
const { only_digits, mb_substr, round, empty, int, float, date, time, pad } = require('../helpers');

const TIPOS = { lancamentos: 'Lançamentos', clientes: 'Clientes', fornecedores: 'Fornecedores' };
const EXT = ['xlsx', 'csv', 'txt', 'xls'];
const MAX_BYTES = 10 * 1024 * 1024;
const tem = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const lower = (s) => String(s ?? '').toLowerCase();

/**
 * Campos de cada tipo: chave => [rótulo, obrigatório, sinônimos do cabeçalho].
 * Os sinônimos são comparados sem acento/maiúscula/pontuação.
 */
function campos(tipo) {
  const c = {
    lancamentos: {
      data: ['Data', true, ['data', 'dt', 'data lancamento', 'data do lancamento', 'competencia', 'data competencia', 'date']],
      tipo: ['Tipo (receita/despesa)', false, ['tipo', 'natureza', 'entrada saida', 'operacao', 'type', 'e s', 'credito debito']],
      descricao: ['Descrição', false, ['descricao', 'historico', 'description', 'detalhe', 'lancamento']],
      valor: ['Valor', true, ['valor', 'valor bruto', 'montante', 'total', 'amount', 'valor r', 'valor rs', 'quantia']],
      categoria: ['Categoria', false, ['categoria', 'category', 'classificacao']],
      cliente_fornecedor: ['Cliente / fornecedor', false, ['cliente fornecedor', 'cliente', 'fornecedor', 'favorecido', 'pagador', 'beneficiario', 'contraparte', 'nome']],
      forma_pagamento: ['Forma de pagamento', false, ['forma pagamento', 'forma de pagamento', 'forma', 'meio de pagamento', 'meio pagamento', 'pagamento forma']],
      caixa: ['Caixa / banco', false, ['caixa banco', 'caixa', 'banco', 'conta bancaria', 'conta corrente']],
      centro_custo: ['Centro de custo', false, ['centro de custo', 'centro custo', 'centro']],
      grupo: ['Grupo (plano de contas)', false, ['grupo', 'grupo de contas', 'grupo contas']],
      conta: ['Conta (plano de contas)', false, ['conta', 'conta contabil', 'subconta']],
      status: ['Situação (quitado/em aberto)', false, ['status', 'situacao', 'pago', 'quitado', 'baixado']],
      data_vencimento: ['Vencimento', false, ['vencimento', 'data vencimento', 'data de vencimento', 'dt vencimento', 'venc']],
      data_pagamento: ['Data de pagamento', false, ['data pagamento', 'data de pagamento', 'pagamento', 'data baixa', 'dt pagamento', 'data recebimento', 'pago em']],
      observacoes: ['Observações', false, ['observacoes', 'observacao', 'obs', 'notas', 'comentario']],
    },
    clientes: {
      nome: ['Nome', true, ['nome', 'cliente', 'nome fantasia', 'fantasia']],
      razao_social: ['Razão social', false, ['razao social', 'razao']],
      cnpj_cpf: ['CPF / CNPJ', false, ['cnpj cpf', 'cpf cnpj', 'cpf', 'cnpj', 'documento', 'doc']],
      email: ['E-mail', false, ['email', 'e mail']],
      telefone: ['Telefone', false, ['telefone', 'fone', 'celular', 'whatsapp', 'contato']],
      estado: ['Estado (UF)', false, ['estado', 'uf']],
      cidade: ['Cidade', false, ['cidade', 'municipio']],
      endereco: ['Endereço', false, ['endereco', 'logradouro', 'rua']],
      observacoes: ['Observações', false, ['observacoes', 'observacao', 'obs']],
    },
    fornecedores: {
      nome: ['Nome', true, ['nome', 'fornecedor', 'nome fantasia', 'fantasia']],
      razao_social: ['Razão social', false, ['razao social', 'razao']],
      cnpj_cpf: ['CNPJ / CPF', false, ['cnpj cpf', 'cpf cnpj', 'cnpj', 'cpf', 'documento', 'doc']],
      email: ['E-mail', false, ['email', 'e mail']],
      telefone: ['Telefone', false, ['telefone', 'fone', 'contato']],
      whatsapp: ['WhatsApp', false, ['whatsapp', 'whats', 'celular']],
      responsavel: ['Responsável', false, ['responsavel', 'contato nome', 'representante']],
      estado: ['Estado (UF)', false, ['estado', 'uf']],
      cidade: ['Cidade', false, ['cidade', 'municipio']],
      endereco: ['Endereço', false, ['endereco', 'logradouro', 'rua']],
      observacoes: ['Observações', false, ['observacoes', 'observacao', 'obs']],
    },
  };
  if (!c[tipo]) throw new HttpException(400, 'Tipo de importação inválido');
  return c[tipo];
}

const ACENTOS = { á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a', é: 'e', ê: 'e', è: 'e', í: 'i', ì: 'i', ó: 'o', ô: 'o', õ: 'o', ò: 'o', ú: 'u', ü: 'u', ù: 'u', ç: 'c', º: '', ª: '' };

function normalizar(s) {
  s = String(s ?? '').trim().toLowerCase();
  s = Array.from(s).map((ch) => (ACENTOS[ch] !== undefined ? ACENTOS[ch] : ch)).join('');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

function letra(i) {
  let s = ''; i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

// ─── Passo 1: analisar ──────────────────────────────────────────────────────
async function analisar(tipo, arquivo, temCabecalho = true) {
  const cs = campos(tipo);
  if (!arquivo || (arquivo.error ?? 1) !== 0) throw new HttpException(400, 'Envie o arquivo da planilha');
  if (arquivo.size > MAX_BYTES) throw new HttpException(400, 'Arquivo muito grande (máx. 10 MB)');
  const ext = path.extname(String(arquivo.name)).slice(1).toLowerCase();
  if (!EXT.includes(ext)) throw new HttpException(400, 'Envie um arquivo .xlsx ou .csv');

  const rows = PlanilhaReader.ler(arquivo.tmp_name, ext);
  // Pula linhas vazias do topo (título da planilha, etc.)
  while (rows.length && !rows[0].some((v) => v !== '')) rows.shift();
  if (!rows.length) throw new HttpException(400, 'A planilha está vazia');
  const ncol = Math.max(...rows.map((r) => r.length));
  let headers;
  if (temCabecalho) {
    const cab = rows.shift();
    headers = [];
    for (let i = 0; i < ncol; i++) headers.push(String(cab[i] ?? '').trim() || 'Coluna ' + letra(i));
  } else {
    headers = Array.from({ length: ncol }, (_, i) => 'Coluna ' + letra(i));
  }
  const linhaInicial = temCabecalho ? 2 : 1;
  const dados = [];
  rows.forEach((r, i) => {
    if (!r.some((v) => v !== '')) return;
    const v = r.slice(0, ncol);
    while (v.length < ncol) v.push('');
    dados.push({ n: i + linhaInicial, v });
  });
  if (!dados.length) throw new HttpException(400, 'Nenhuma linha com dados encontrada abaixo do cabeçalho');
  if (dados.length > PlanilhaReader.MAX_LINHAS) throw new HttpException(400, 'Máximo de ' + PlanilhaReader.MAX_LINHAS + ' linhas por importação');

  await Armazenamento.limparAntigos('storage/imports', 86400);
  const token = crypto.randomBytes(16).toString('hex');
  const payload = {
    user_id: int(Auth.atual().id), tipo, arquivo: mb_substr(path.basename(String(arquivo.name).replace(/\\/g, '/')), 0, 255),
    headers, linhas: dados, criado: time(),
  };
  try { await Armazenamento.gravar(caminho(token), JSON.stringify(payload)); } catch {
    throw new HttpException(500, 'Não foi possível guardar o arquivo temporário (confira permissão de escrita em storage/)');
  }

  return {
    token, tipo, arquivo: payload.arquivo, total: dados.length,
    colunas: headers, mapeamento: sugerirMapeamento(cs, headers),
    campos: Object.entries(cs).map(([k, c]) => ({ chave: k, label: c[0], obrigatorio: c[1] })),
    amostra: dados.slice(0, 5).map((l) => l.v),
  };
}

/** campo => índice da coluna (ou null). Cada coluna é usada por no máximo um campo. */
function sugerirMapeamento(cs, headers) {
  const norm = headers.map(normalizar);
  const usadas = {}; const map = {};
  // 1ª passada: igualdade exata com algum sinônimo; 2ª: cabeçalho que começa com o sinônimo.
  for (const exato of [true, false]) {
    for (const [k, [, , sin]] of Object.entries(cs)) {
      if (map[k] !== undefined) continue;
      achou: for (const s of sin) {
        for (let i = 0; i < norm.length; i++) {
          const h = norm[i];
          if (usadas[i] || h === '') continue;
          if (exato ? h === s : (h.startsWith(s + ' ') || (h.includes(' ' + s) && s.length > 4))) {
            map[k] = i; usadas[i] = true; break achou;
          }
        }
      }
    }
  }
  const out = {};
  for (const k of Object.keys(cs)) out[k] = map[k] ?? null;
  return out;
}

// ─── Conversões ─────────────────────────────────────────────────────────────
const numerico = (v) => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v);

/** "R$ 1.234,56" | "1234.56" | "(1.234,56)" | "-1.234,56" → número, ou null se não for número. */
function valor(s) {
  s = String(s ?? '').replace(/R\$/gi, '').replace(/BRL/gi, '').replace(/ /g, '').replace(/ /g, '').trim();
  if (s === '') return null;
  let neg = false;
  let m = s.match(/^\((.*)\)$/);
  if (m) { neg = true; s = m[1]; }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const temP = s.includes('.'); const temV = s.includes(',');
  if (temP && temV) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(/,/g, '.');
    else s = s.replace(/,/g, '');
  } else if (temV) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  } else if (temP && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  if (!numerico(s)) return null;
  m = parseFloat(s);
  return neg ? -m : m;
}

function checkdate(mo, d, y) {
  if (mo < 1 || mo > 12 || d < 1 || y < 1) return false;
  return d <= new Date(y, mo, 0).getDate();
}

/** Várias formas de data → AAAA-MM-DD, ou null. */
function data(s) {
  s = String(s ?? '').trim();
  if (s === '') return null;
  let y; let mo; let d; let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)) || (m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
  } else if (/^\d{5}(\.\d+)?$/.test(s) && parseFloat(s) > 20000 && parseFloat(s) < 80000) {
    return PlanilhaReader.serialParaData(parseFloat(s)); // data que veio como número do Excel
  } else return null;
  return checkdate(mo, d, y) && y >= 1990 && y <= 2100 ? `${pad(y, 4)}-${pad(mo)}-${pad(d)}` : null;
}

function tipoDe(s) {
  const n = normalizar(s);
  if (n === '') return null;
  if (['receita', 'receitas', 'entrada', 'entradas', 'income', 'r', 'e', 'c', 'credito', 'recebimento', 'venda', '+'].includes(n) || n.startsWith('receita') || n.startsWith('entrada')) return 'income';
  if (['despesa', 'despesas', 'saida', 'saidas', 'expense', 'd', 's', 'debito', 'pagamento', 'gasto', 'custo', '-'].includes(n) || n.startsWith('despesa') || n.startsWith('saida')) return 'expense';
  return null;
}

function status(s) {
  const n = normalizar(s);
  if (n === '') return null;
  if (['quitado', 'pago', 'paga', 'recebido', 'recebida', 'sim', 's', 'liquidado', 'baixado', 'ok', 'realizado', 'concluido', 'true', 'verdadeiro', '1'].includes(n)) return 'quitado';
  if (['em aberto', 'em_aberto', 'aberto', 'pendente', 'a pagar', 'a receber', 'nao', 'n', 'previsto', 'agendado', 'false', 'falso', '0', 'vencido', 'em atraso'].includes(n)) return 'em_aberto';
  return null;
}

// ─── Passo 2: validar (prévia) ──────────────────────────────────────────────
function opcoesPadrao(o) {
  o = o && typeof o === 'object' ? o : {};
  return {
    tipo_padrao: ['income', 'expense', 'sinal'].includes(o.tipo_padrao ?? '') ? o.tipo_padrao : 'sinal',
    status_padrao: (o.status_padrao ?? '') === 'em_aberto' ? 'em_aberto' : 'quitado',
    criar_categorias: !empty(o.criar_categorias),
    ignorar_duplicados: !tem(o, 'ignorar_duplicados') || !empty(o.ignorar_duplicados),
  };
}

async function carregar(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token))) throw new HttpException(400, 'Importação inválida');
  const bruto = await Armazenamento.ler(caminho(token));
  if (!bruto) throw new HttpException(410, 'Essa prévia expirou. Envie o arquivo de novo.');
  let d = null;
  try { d = JSON.parse(bruto.toString('utf8')); } catch { d = null; }
  if (!d || typeof d !== 'object' || int(d.user_id) !== int(Auth.atual().id)) throw new HttpException(403, 'Importação de outro usuário');
  return d;
}

const conjunto = (lista) => new Set(lista);

/** Aplica mapeamento + opções em todas as linhas. Não grava nada. */
async function processar(token, mapa, opcoes) {
  const d = await carregar(token);
  const tipo = d.tipo;
  const cs = campos(tipo);
  opcoes = opcoesPadrao(opcoes);
  mapa = mapa && typeof mapa === 'object' ? mapa : {};
  for (const [k, [label, obrig]] of Object.entries(cs)) {
    if (obrig && (mapa[k] === undefined || mapa[k] === null || mapa[k] === '')) throw new HttpException(400, `Escolha qual coluna da planilha é "${label}"`);
  }
  const col = (v, k) => (mapa[k] !== undefined && mapa[k] !== null && mapa[k] !== '' ? String(v[int(mapa[k])] ?? '').trim() : '');

  const linhas = [];
  const vistos = {};
  // Cadastros existentes, pra avisar quando o nome não bate.
  const nomes = async (sql) => (await Database.all(sql)).map((r) => Object.values(r)[0]);
  const existe = {
    formas: conjunto((await nomes('SELECT nome FROM formas_pagamento')).map(lower)),
    caixas: conjunto((await nomes('SELECT nome FROM caixas')).map(lower)),
    centros: conjunto((await nomes('SELECT nome FROM centros_custo')).map(lower)),
    clientes_doc: conjunto((await nomes('SELECT cnpj_cpf FROM clientes')).map((x) => only_digits(String(x ?? ''))).filter((x) => x)),
    clientes_nome: conjunto((await nomes('SELECT nome FROM clientes')).map(lower)),
    forn_doc: conjunto((await nomes('SELECT cnpj_cpf FROM fornecedores')).map((x) => only_digits(String(x ?? ''))).filter((x) => x)),
    forn_nome: conjunto((await nomes('SELECT nome FROM fornecedores')).map(lower)),
  };
  const catCache = new Map();

  for (const l of d.linhas) {
    const v = l.v;
    const erros = []; const avisos = [];
    let reg = {};
    let dup = false;
    if (tipo === 'lancamentos') {
      const dt = data(col(v, 'data'));
      if (!dt) erros.push(col(v, 'data') === '' ? 'sem data' : 'data inválida "' + col(v, 'data') + '"');
      const valorTxt = col(v, 'valor');
      let vl = valor(valorTxt);
      if (vl === null) erros.push(valorTxt === '' ? 'sem valor' : 'valor inválido "' + valorTxt + '"');
      let tp = tipoDe(col(v, 'tipo'));
      if (!tp) {
        if (col(v, 'tipo') !== '') avisos.push('tipo "' + col(v, 'tipo') + '" não reconhecido');
        tp = opcoes.tipo_padrao === 'sinal' ? ((vl ?? 0) < 0 ? 'expense' : 'income') : opcoes.tipo_padrao;
      }
      if (vl !== null && vl === 0) erros.push('valor zerado');
      vl = vl !== null ? round(Math.abs(vl), 2) : null;
      const venc = col(v, 'data_vencimento') !== '' ? data(col(v, 'data_vencimento')) : null;
      if (col(v, 'data_vencimento') !== '' && !venc) avisos.push('vencimento inválido ignorado');
      let pag = col(v, 'data_pagamento') !== '' ? data(col(v, 'data_pagamento')) : null;
      if (col(v, 'data_pagamento') !== '' && !pag) avisos.push('data de pagamento inválida ignorada');
      let st = status(col(v, 'status'));
      if (!st) {
        if (col(v, 'status') !== '') avisos.push('situação "' + col(v, 'status') + '" não reconhecida');
        st = pag ? 'quitado' : opcoes.status_padrao;
      }
      if (st === 'quitado' && !pag && dt) pag = dt;
      if (st === 'em_aberto') pag = null;

      let catNome = col(v, 'categoria');
      let catId = null; let catCriar = false;
      if (catNome !== '') {
        const ck = lower(catNome) + '|' + tp;
        if (!catCache.has(ck)) catCache.set(ck, await Categoria.porNome(catNome, tp));
        const cat = catCache.get(ck);
        if (cat) { catId = int(cat.id); catNome = cat.nome; } else if (opcoes.criar_categorias) { catCriar = true; avisos.push(`categoria "${catNome}" será criada`); } else { avisos.push(`categoria "${catNome}" não existe — fica sem categoria`); catNome = ''; }
      }
      const forma = col(v, 'forma_pagamento'); const caixa = col(v, 'caixa'); const centro = col(v, 'centro_custo');
      if (forma !== '' && !existe.formas.has(lower(forma))) avisos.push(`forma "${forma}" não cadastrada (sem taxa)`);
      if (caixa !== '' && !existe.caixas.has(lower(caixa))) avisos.push(`caixa "${caixa}" não cadastrado`);
      if (centro !== '' && !existe.centros.has(lower(centro))) avisos.push(`centro de custo "${centro}" não cadastrado`);
      const desc = mb_substr(col(v, 'descricao'), 0, 255);

      reg = {
        tipo: tp, data: dt, valor: vl, descricao: desc,
        categoria_id: catId, categoria_nome: catNome !== '' ? catNome : null, categoria_criar: catCriar,
        cliente_fornecedor: col(v, 'cliente_fornecedor'), forma_pagamento: forma, caixa_banco: caixa,
        centro_custo: centro, grupo_contas: col(v, 'grupo'), conta: col(v, 'conta'),
        status: st, data_vencimento: venc, data_pagamento: pag, observacoes: col(v, 'observacoes'),
      };
      if (!erros.length) {
        const chave = `${tp}|${dt}|${vl}|` + lower(desc);
        if (vistos[chave] !== undefined) { dup = true; avisos.push('repetido na própria planilha (linha ' + vistos[chave] + ')'); } else if (await Transacao.existeIgual(tp, dt, vl, desc)) { dup = true; avisos.push('já existe um lançamento igual no sistema'); }
        if (vistos[chave] === undefined) vistos[chave] = l.n;
      }
    } else {
      const forn = tipo === 'fornecedores';
      const inp = {};
      for (const k of Object.keys(cs)) inp[k] = col(v, k);
      inp.ativo = '1';
      // Até 3 tentativas: e-mail ou documento inválido viram aviso (o campo é limpo) em vez de barrar a linha.
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          reg = forn ? await Fornecedor.campos(inp, null, false) : await Cliente.campos(inp, null);
          break;
        } catch (e) {
          if (!(e instanceof HttpException)) throw e;
          const msg = e.message;
          reg = { ...inp };
          if (lower(msg).includes('já cadastrado')) { dup = true; avisos.push('documento já cadastrado no sistema'); break; }
          if (lower(msg).includes('e-mail inválido') && inp.email !== '') { avisos.push('e-mail inválido ignorado'); inp.email = ''; continue; }
          if (lower(msg).includes('inválido') && (inp.cnpj_cpf ?? '') !== '') { avisos.push('CPF/CNPJ inválido ignorado'); inp.cnpj_cpf = ''; continue; }
          erros.push(msg.replace('Campo obrigatório: ', 'sem ').toLowerCase());
          break;
        }
      }
      if (!erros.length && !dup && reg && Object.keys(reg).length) {
        const docD = only_digits(String(reg.cnpj_cpf ?? ''));
        const nomeL = lower(reg.nome);
        const mapDoc = forn ? 'forn_doc' : 'clientes_doc'; const mapNome = forn ? 'forn_nome' : 'clientes_nome';
        if ((docD && existe[mapDoc].has(docD)) || existe[mapNome].has(nomeL)) { dup = true; avisos.push('já cadastrado no sistema'); } else if (vistos[nomeL] || (docD && vistos[docD])) { dup = true; avisos.push('repetido na própria planilha'); }
        vistos[nomeL] = true; if (docD) vistos[docD] = true;
      }
    }
    const situacao = erros.length ? 'erro' : (dup ? 'duplicado' : (avisos.length ? 'aviso' : 'ok'));
    linhas.push({ linha: l.n, situacao, erros, avisos, dados: reg });
  }

  const cont = { ok: 0, aviso: 0, erro: 0, duplicado: 0 };
  for (const l of linhas) cont[l.situacao]++;
  const importaveis = linhas.filter((l) => importavel(l, tipo, opcoes));
  const soma = { income: 0, expense: 0 };
  if (tipo === 'lancamentos') for (const l of importaveis) soma[l.dados.tipo] += float(l.dados.valor);
  return {
    tipo, arquivo: d.arquivo, opcoes, total: linhas.length, contagem: cont,
    importaveis: importaveis.length, soma, linhas,
  };
}

/** Linha entra na importação? Duplicado só entra em lançamentos e se a pessoa desmarcar "ignorar duplicados". */
function importavel(l, tipo, op) {
  if (l.situacao === 'ok' || l.situacao === 'aviso') return true;
  return l.situacao === 'duplicado' && tipo === 'lancamentos' && !op.ignorar_duplicados;
}

// ─── Passo 3: confirmar ─────────────────────────────────────────────────────
async function confirmar(token, mapa, opcoes) {
  const prev = await processar(token, mapa, opcoes);
  const op = prev.opcoes;
  const tipo = prev.tipo;
  const linhas = prev.linhas.filter((l) => importavel(l, tipo, op));
  if (!linhas.length) throw new HttpException(400, 'Nenhuma linha válida para importar');
  const u = Auth.atual();

  const res = await Database.transaction(async () => {
    const impId = await Importacao.create({
      tipo, arquivo_nome: prev.arquivo, total_linhas: prev.total,
      importados: 0, ignorados: 0, user_id: u.id, username: u.username,
    });
    let n = 0; let total = 0; const catsCriadas = {};
    for (const l of linhas) {
      const r = { ...l.dados };
      if (tipo === 'lancamentos') {
        if (r.categoria_criar && r.categoria_nome) {
          const ck = lower(r.categoria_nome) + '|' + r.tipo;
          if (catsCriadas[ck] === undefined) {
            const ex = await Categoria.porNome(r.categoria_nome, r.tipo);
            catsCriadas[ck] = ex ? int(ex.id) : await Categoria.create({ nome: mb_substr(r.categoria_nome, 0, 150), tipo: r.tipo, cor: '#5E6E63', descricao: 'Criada na importação', ativo: 1 });
          }
          r.categoria_id = catsCriadas[ck];
        }
        const f = await Transacao.campos(r);
        f.user_id = u.id;
        f.importacao_id = impId;
        await Transacao.create(f);
        total += f.tipo === 'income' ? f.valor : -f.valor;
      } else if (tipo === 'clientes') {
        await Cliente.create({ ...r, importacao_id: impId });
      } else {
        await Fornecedor.create({ ...r, importacao_id: impId });
      }
      n++;
    }
    await Importacao.update(impId, { importados: n, ignorados: prev.total - n, valor_total: round(total, 2) });
    return { id: impId, importados: n, ignorados: prev.total - n, categorias_criadas: Object.values(catsCriadas).filter((x) => x).length, saldo: round(total, 2) };
  });
  await Armazenamento.apagar(caminho(token));
  return { ...res, tipo, arquivo: prev.arquivo };
}

// ─── Modelos de planilha ────────────────────────────────────────────────────
/** Valores em dinheiro vêm como XlsxWriter.dinheiro (no CSV saem com vírgula). */
function modelo(tipo) {
  const hoje = date('d/m/Y');
  const R = XlsxWriter.dinheiro;
  if (tipo === 'lancamentos') {
    return [
      ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Cliente/Fornecedor', 'Forma de pagamento', 'Caixa/Banco', 'Centro de custo', 'Situação', 'Vencimento', 'Data de pagamento', 'Observações'],
      [hoje, 'Receita', 'Consulta particular', R(350.00), 'Consultas', 'Maria Silva', 'PIX', 'Itaú', 'RECEITA OPERACIONAL', 'Quitado', '', hoje, ''],
      [hoje, 'Despesa', 'Aluguel do mês', R(2500.00), 'Aluguel', 'Imobiliária Exemplo', 'BOLETO BANCÁRIO', 'Itaú', 'DESPESAS OPERACIONAIS', 'Em aberto', hoje, '', 'Vence todo dia 10'],
    ];
  }
  if (tipo === 'clientes') {
    return [
      ['Nome', 'Razão social', 'CPF/CNPJ', 'E-mail', 'Telefone', 'Estado', 'Cidade', 'Endereço', 'Observações'],
      ['Maria Silva', '', '', 'maria@exemplo.com', '(15) 99999-0000', 'SP', 'Sorocaba', 'Rua Exemplo, 100', ''],
    ];
  }
  return [
    ['Nome', 'Razão social', 'CNPJ/CPF', 'E-mail', 'Telefone', 'WhatsApp', 'Responsável', 'Estado', 'Cidade', 'Endereço', 'Observações'],
    ['Papelaria Exemplo', 'Papelaria Exemplo LTDA', '', 'contato@exemplo.com', '(15) 3333-0000', '(15) 99999-0000', 'João', 'SP', 'Sorocaba', '', ''],
  ];
}

// ─── Arquivos temporários (guardados pelo Armazenamento: disco ou banco) ─────
function caminho(token) { return `storage/imports/${token}.json`; }

module.exports = { TIPOS, campos, normalizar, analisar, valor, data, tipo: tipoDe, status, opcoesPadrao, processar, confirmar, modelo };
