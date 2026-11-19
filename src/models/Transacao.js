/** Lançamento (receita ou despesa). */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { mb_substr, round, num, int, float, empty, hoje } = require('../helpers');

const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

class Transacao extends Model {
  static table = 'transactions';

  static ROTULOS = { tipo: 'tipo', data: 'data', descricao: 'descrição', valor: 'valor', categoria_nome: 'categoria',
    cliente_fornecedor: 'cliente/fornecedor', forma_pagamento_nome: 'forma', caixa_nome: 'caixa', status: 'situação',
    data_vencimento: 'vencimento', data_pagamento: 'pagamento' };

  /** Taxa MDR da forma de pagamento (só faz sentido em receita — auditoria-dre.md, item 5). */
  static async taxaMdr(formaNome, valor) {
    if (!formaNome) return 0;
    const fp = await Database.one('SELECT taxa_intermediacao, tarifa_fixa FROM formas_pagamento WHERE nome=?', [formaNome]);
    if (!fp) return 0;
    return round(num(fp.taxa_intermediacao) / 100 * valor + num(fp.tarifa_fixa), 2);
  }

  /** Normaliza a linha do banco pro formato do front (nomes novos + antigos). */
  static out(t) {
    t = { ...t };
    t.id = int(t.id);
    t.valor = float(t.valor);
    t.taxa_mdr = float(t.taxa_mdr ?? 0);
    t.valor_liquido = t.valor_liquido !== null && t.valor_liquido !== undefined ? float(t.valor_liquido) : null;
    t.categoria_id = t.categoria_id !== null && t.categoria_id !== undefined ? int(t.categoria_id) : null;
    t.importacao_id = t.importacao_id !== undefined && t.importacao_id !== null ? int(t.importacao_id) : null;
    if (tem(t, 'comprovante_path')) { t.tem_comprovante = !empty(t.comprovante_path); delete t.comprovante_path; }
    if (tem(t, 'nf_id')) { t.nf_id = t.nf_id !== null ? int(t.nf_id) : null; t.nf_qtd = int(t.nf_qtd ?? 0); }
    const extra = {
      type: t.tipo, date: String(t.data ?? '').slice(0, 10), amount: float(t.valor),
      description: t.descricao, grupo_contas: t.grupo, conta: t.conta_nome,
      categoria: t.categoria_nome, forma_pagamento: t.forma_pagamento_nome,
      caixa_banco: t.caixa_nome, centro_custo: t.centro_custo_nome,
    };
    for (const [k, v] of Object.entries(extra)) if (!tem(t, k)) t[k] = v;
    return t;
  }

  /** Categoria escolhida (id) → [id, nome], validando se serve pro tipo do lançamento. */
  static async resolverCategoria(catId, tipo) {
    if (catId === null || catId === undefined || catId === '' || int(catId) === 0) return [null, null];
    const c = await Database.one('SELECT id, nome, tipo FROM categorias WHERE id=?', [int(catId)]);
    if (!c) throw new HttpException(400, 'Categoria não encontrada');
    if (c.tipo !== 'ambos' && c.tipo !== tipo) throw new HttpException(400, 'Categoria "' + c.nome + '" não é de ' + (tipo === 'income' ? 'receita' : 'despesa'));
    return [int(c.id), c.nome];
  }

  /**
   * Monta os campos do INSERT/UPDATE a partir de um objeto (corpo da requisição ou linha importada).
   * Aceita os nomes novos e os antigos do front.
   */
  static async campos(inp) {
    const g = (keys, def = '') => {
      for (const k of keys) if (inp[k] !== undefined && inp[k] !== null && inp[k] !== '') return inp[k];
      return def;
    };
    const tipo = g(['type', 'tipo']);
    const data = g(['date', 'data']);
    if (!['income', 'expense'].includes(tipo)) throw new HttpException(400, 'Informe se é receita ou despesa');
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data))) throw new HttpException(400, 'Data inválida');
    if (g(['amount', 'valor'], null) === null) throw new HttpException(400, 'Informe o valor');
    const valor = round(num(g(['amount', 'valor'], 0)), 2);
    if (valor <= 0) throw new HttpException(400, 'O valor precisa ser maior que zero');
    const forma = String(g(['forma_pagamento', 'forma_pagamento_nome']));
    const taxa = tipo === 'income' ? await Transacao.taxaMdr(forma, valor) : 0;
    const [catId, catNome] = await Transacao.resolverCategoria(inp.categoria_id ?? null, tipo);
    const date = (k) => (!empty(inp[k]) && /^\d{4}-\d{2}-\d{2}$/.test(String(inp[k])) ? inp[k] : null);
    const status = (inp.status ?? '') === 'em_aberto' ? 'em_aberto' : 'quitado';
    return {
      tipo, data,
      descricao: mb_substr(String(g(['description', 'descricao'])), 0, 255),
      valor,
      conta_nome: mb_substr(String(g(['conta', 'conta_nome'])), 0, 150),
      grupo: mb_substr(String(g(['grupo_contas', 'grupo'])), 0, 150),
      categoria_id: catId, categoria_nome: catNome,
      cliente_fornecedor: mb_substr(String(inp.cliente_fornecedor ?? ''), 0, 255),
      forma_pagamento_nome: mb_substr(forma, 0, 100),
      caixa_nome: mb_substr(String(g(['caixa_banco', 'caixa_nome'])), 0, 100),
      centro_custo_nome: mb_substr(String(g(['centro_custo', 'centro_custo_nome'])), 0, 150),
      // status só existe como 'em_aberto' ou 'quitado' (auditoria-dre.md, item 6)
      status,
      data_vencimento: date('data_vencimento'),
      // Quitado sem data de pagamento: usa a data do lançamento (mesmo critério do fluxo de caixa).
      data_pagamento: date('data_pagamento') ?? null,
      taxa_mdr: taxa, valor_liquido: round(valor - taxa, 2),
      observacoes: String(inp.observacoes ?? ''),
    };
  }

  static async listar(f) {
    // nf_id / nf_qtd: nota(s) fiscal(is) vinculada(s) — aparecem como etiqueta "NF" na lista.
    let sql = `SELECT transactions.*, (SELECT MIN(n.id) FROM notas_fiscais n WHERE n.transaction_id=transactions.id) AS nf_id,
                      (SELECT COUNT(*) FROM notas_fiscais n WHERE n.transaction_id=transactions.id) AS nf_qtd
               FROM transactions WHERE 1=1`;
    const p = [];
    const map = { year: 'YEAR(data)=?', month: 'MONTH(data)=?', type: 'tipo=?', status: 'status=?',
      categoria_id: 'categoria_id=?', centro_custo: 'centro_custo_nome=?', forma_pagamento: 'forma_pagamento_nome=?',
      caixa_banco: 'caixa_nome=?', importacao_id: 'importacao_id=?' };
    for (const [k, cond] of Object.entries(map)) {
      if (f[k] === undefined || f[k] === '' || f[k] === null) continue;
      sql += ` AND ${cond}`;
      p.push(['year', 'month', 'categoria_id', 'importacao_id'].includes(k) ? int(f[k]) : String(f[k]));
    }
    sql += ' ORDER BY data DESC, id DESC';
    return (await Database.all(sql, p)).map(Transacao.out);
  }

  static async emAberto() {
    return (await Database.all("SELECT * FROM transactions WHERE status='em_aberto' AND data_vencimento IS NOT NULL ORDER BY data_vencimento")).map(Transacao.out);
  }

  /** Já existe lançamento igual? (usado na importação pra não duplicar) */
  static async existeIgual(tipo, data, valor, descricao) {
    return !!int(await Database.value('SELECT COUNT(*) FROM transactions WHERE tipo=? AND data=? AND valor=? AND descricao=?', [tipo, data, valor, descricao]));
  }

  /** Totais em aberto (independe do ano): a receber, a pagar e quanto disso já venceu. */
  static async resumoEmAberto() {
    const r = await Database.one(`SELECT
        COALESCE(SUM(CASE WHEN tipo='income'  THEN valor END),0) a_receber,
        COALESCE(SUM(CASE WHEN tipo='expense' THEN valor END),0) a_pagar,
        COALESCE(SUM(CASE WHEN tipo='income'  AND COALESCE(data_vencimento,data)<CURDATE() THEN valor END),0) receber_vencido,
        COALESCE(SUM(CASE WHEN tipo='expense' AND COALESCE(data_vencimento,data)<CURDATE() THEN valor END),0) pagar_vencido,
        COALESCE(SUM(CASE WHEN COALESCE(data_vencimento,data)<CURDATE() THEN 1 ELSE 0 END),0) qtd_vencidos
      FROM transactions WHERE status='em_aberto'`);
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = float(v);
    return out;
  }

  /**
   * Agenda do mês (calendário): todos os lançamentos. Cada um cai na data de vencimento;
   * sem vencimento, na data de pagamento; sem as duas, na data do lançamento.
   */
  static async agenda(ano, mes) {
    const ini = `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`;
    const rows = await Database.all(`SELECT id, tipo, descricao, valor, status, cliente_fornecedor, categoria_id, categoria_nome, forma_pagamento_nome, caixa_nome,
          centro_custo_nome, grupo, conta_nome, observacoes, data, data_vencimento, data_pagamento,
          comprovante_nome, (comprovante_path IS NOT NULL) AS tem_comprovante,
          COALESCE(data_vencimento, data_pagamento, data) AS venc
        FROM transactions
        WHERE COALESCE(data_vencimento, data_pagamento, data) BETWEEN ? AND LAST_DAY(?)
        ORDER BY venc, tipo, id`, [ini, ini]);
    const h = hoje();
    return rows.map((r) => ({
      ...r, id: int(r.id), valor: float(r.valor), tem_comprovante: !!r.tem_comprovante,
      categoria_id: r.categoria_id !== null ? int(r.categoria_id) : null,
      venc: String(r.venc).slice(0, 10),
      vencido: r.status === 'em_aberto' && String(r.venc).slice(0, 10) < h,
    }));
  }

  /** Próximos vencimentos em aberto (inclui os vencidos), pro Dashboard. */
  static async proximos(dias = 7, limite = 8) {
    const rows = await Database.all(`SELECT id, tipo, descricao, valor, status, cliente_fornecedor, categoria_nome, COALESCE(data_vencimento, data) AS venc
        FROM transactions WHERE status='em_aberto' AND COALESCE(data_vencimento, data) <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY venc, id LIMIT ${int(limite)}`, [dias]);
    const h = hoje();
    return rows.map((r) => ({ ...r, id: int(r.id), valor: float(r.valor), venc: String(r.venc).slice(0, 10), vencido: String(r.venc).slice(0, 10) < h }));
  }
}

module.exports = Transacao;
