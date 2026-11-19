/** Caixa físico, conta bancária ou investimento. */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, agencia_valida, conta_valida, round, num, float, int } = require('../helpers');

class Caixa extends Model {
  static table = 'caixas';

  static TIPOS = ['banco', 'caixa', 'investimento'];
  static ROTULOS = { nome: 'nome', tipo: 'tipo', banco: 'banco', agencia: 'agência', conta: 'conta', saldo_inicial: 'saldo inicial', observacoes: 'observações' };

  static async campos(inp, id) {
    const nome = String(inp.nome ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Campo obrigatório: Nome');
    if (await Database.one('SELECT id FROM caixas WHERE nome=?' + (id ? ' AND id<>?' : ''), id ? [nome, id] : [nome])) throw new HttpException(400, 'Já existe um caixa/conta com esse nome');
    const tipo = Caixa.TIPOS.includes(inp.tipo ?? '') ? inp.tipo : 'banco';
    const c = (k, n) => cut(str_or_null(inp[k] ?? null), n);
    return {
      nome: mb_substr(nome, 0, 100), tipo,
      banco: tipo === 'caixa' ? null : c('banco', 100),
      agencia: tipo === 'caixa' ? null : agencia_valida(inp.agencia ?? null),
      conta: tipo === 'caixa' ? null : conta_valida(inp.conta ?? null),
      saldo_inicial: round(num(inp.saldo_inicial ?? 0), 2),
      observacoes: c('observacoes', 255),
    };
  }

  /**
   * Saldo de cada caixa até hoje: saldo inicial + receitas quitadas − despesas quitadas
   * (pela data do pagamento, mesmo critério do Fluxo de Caixa) ± transferências.
   * Também devolve o que está em aberto (a receber / a pagar) apontado pra ele.
   */
  static async comSaldo() {
    const mov = {};
    for (const r of await Database.all(`SELECT caixa_nome n,
          SUM(CASE WHEN status='quitado' AND tipo='income'  AND COALESCE(data_pagamento,data)<=CURDATE() THEN valor ELSE 0 END) rec,
          SUM(CASE WHEN status='quitado' AND tipo='expense' AND COALESCE(data_pagamento,data)<=CURDATE() THEN valor ELSE 0 END) desp,
          SUM(CASE WHEN status='em_aberto' AND tipo='income'  THEN valor ELSE 0 END) a_receber,
          SUM(CASE WHEN status='em_aberto' AND tipo='expense' THEN valor ELSE 0 END) a_pagar,
          COUNT(*) qtd
        FROM transactions GROUP BY caixa_nome`)) mov[String(r.n ?? '')] = r;
    const trIn = {}; const trOut = {};
    for (const r of await Database.all('SELECT destino_nome n, SUM(valor) v FROM transfers WHERE data<=CURDATE() GROUP BY destino_nome')) trIn[String(r.n ?? '')] = float(r.v);
    for (const r of await Database.all('SELECT origem_nome n, SUM(valor) v FROM transfers WHERE data<=CURDATE() GROUP BY origem_nome')) trOut[String(r.n ?? '')] = float(r.v);
    return (await Database.all('SELECT * FROM caixas ORDER BY nome')).map((c) => {
      const m = mov[c.nome] ?? { rec: 0, desp: 0, a_receber: 0, a_pagar: 0, qtd: 0 };
      const si = float(c.saldo_inicial);
      const entradas = float(m.rec) + (trIn[c.nome] ?? 0);
      const saidas = float(m.desp) + (trOut[c.nome] ?? 0);
      return {
        ...c, id: int(c.id), saldo_inicial: si, entradas, saidas,
        saldo_atual: round(si + entradas - saidas, 2),
        a_receber: float(m.a_receber), a_pagar: float(m.a_pagar), qtd_lanc: int(m.qtd),
      };
    });
  }

  /** Lançamentos quitados sem caixa (ou com caixa apagado): entram no fluxo "Todos", mas em nenhum saldo. */
  static async semCaixa() {
    const saldo = float(await Database.value(`SELECT COALESCE(SUM(CASE WHEN tipo='income' THEN valor ELSE -valor END),0) FROM transactions
        WHERE status='quitado' AND COALESCE(data_pagamento,data)<=CURDATE()
          AND (caixa_nome IS NULL OR caixa_nome='' OR caixa_nome NOT IN (SELECT nome FROM caixas))`));
    const qtd = int(await Database.value("SELECT COUNT(*) FROM transactions WHERE caixa_nome IS NULL OR caixa_nome='' OR caixa_nome NOT IN (SELECT nome FROM caixas)"));
    return { saldo, qtd };
  }

  static async usoDoNome(nome) {
    return int(await Database.value('SELECT COUNT(*) FROM transactions WHERE caixa_nome=?', [nome]))
      + int(await Database.value('SELECT COUNT(*) FROM transfers WHERE origem_nome=? OR destino_nome=?', [nome, nome]));
  }

  /** Lançamentos e transferências guardam o nome — renomeia junto pra não perder o saldo. */
  static async renomearReferencias(de, para) {
    await Database.run('UPDATE transactions SET caixa_nome=? WHERE caixa_nome=?', [para, de]);
    await Database.run('UPDATE transfers SET origem_nome=? WHERE origem_nome=?', [para, de]);
    await Database.run('UPDATE transfers SET destino_nome=? WHERE destino_nome=?', [para, de]);
  }

  static async nomes() { return (await Database.all('SELECT nome FROM caixas ORDER BY id')).map((r) => r.nome); }
}

module.exports = Caixa;
