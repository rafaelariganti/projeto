/**
 * Nota fiscal (PDF e/ou XML) com vínculo opcional a um lançamento (inclusive conta a pagar/receber em aberto).
 * tipo: entrada = compra/serviço tomado (despesa) · saida = venda/serviço prestado (receita).
 */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, only_digits, round, num, int, float, empty, hoje, env, mb_substr, brl, data_br } = require('../helpers');

const SELECT = `SELECT n.*, t.descricao AS tx_descricao, t.valor AS tx_valor, t.tipo AS tx_tipo, t.status AS tx_status,
                       t.data AS tx_data, t.data_vencimento AS tx_vencimento, t.cliente_fornecedor AS tx_pessoa
                FROM notas_fiscais n LEFT JOIN transactions t ON t.id = n.transaction_id`;

const sqlDoc = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(${col},'.',''),'/',''),'-',''),' ','')`;

class NotaFiscal extends Model {
  static table = 'notas_fiscais';

  static TIPOS = ['entrada', 'saida'];
  static MODELOS = ['NF-e', 'NFC-e', 'NFS-e', 'Outro'];
  static ROTULOS = { tipo: 'tipo', modelo: 'modelo', numero: 'número', serie: 'série', chave: 'chave',
    data_emissao: 'emissão', valor: 'valor', emitente_nome: 'emitente', destinatario_nome: 'destinatário', descricao: 'descrição' };

  static out(r) {
    r = { ...r };
    r.id = int(r.id);
    r.valor = float(r.valor);
    r.transaction_id = r.transaction_id !== null && r.transaction_id !== undefined ? int(r.transaction_id) : null;
    // Lançamento apagado por fora: some o vínculo na resposta.
    if (r.transaction_id && (r.tx_tipo ?? null) === null) r.transaction_id = null;
    r.tx_valor = r.tx_valor !== undefined && r.tx_valor !== null ? float(r.tx_valor) : null;
    r.tem_pdf = !empty(r.pdf_path);
    r.tem_xml = !empty(r.xml_path);
    delete r.pdf_path; delete r.xml_path; // caminho interno não vai pro navegador
    return r;
  }

  static async buscar(id) {
    const r = await Database.one(SELECT + ' WHERE n.id=?', [id]);
    return r ? NotaFiscal.out(r) : null;
  }

  static async listar(f) {
    let sql = SELECT + ' WHERE 1=1'; const p = [];
    if (f.tipo && NotaFiscal.TIPOS.includes(f.tipo)) { sql += ' AND n.tipo=?'; p.push(f.tipo); }
    if ((f.vinculo ?? '') === 'com') sql += ' AND t.id IS NOT NULL';
    if ((f.vinculo ?? '') === 'sem') sql += ' AND t.id IS NULL';
    if (!empty(f.year)) { sql += ' AND YEAR(COALESCE(n.data_emissao, n.created_at))=?'; p.push(int(f.year)); }
    if (!empty(f.month)) { sql += ' AND MONTH(COALESCE(n.data_emissao, n.created_at))=?'; p.push(int(f.month)); }
    if (!empty(f.transaction_id)) { sql += ' AND n.transaction_id=?'; p.push(int(f.transaction_id)); }
    if (!empty(f.busca)) {
      const b = '%' + f.busca + '%';
      const d = only_digits(String(f.busca));
      sql += ' AND (n.numero LIKE ? OR n.emitente_nome LIKE ? OR n.destinatario_nome LIKE ? OR n.descricao LIKE ? OR n.chave LIKE ?'
        + (d !== '' ? ' OR n.emitente_doc LIKE ? OR n.destinatario_doc LIKE ?' : '') + ')';
      p.push(b, b, b, b, b);
      if (d !== '') p.push(`%${d}%`, `%${d}%`);
    }
    sql += ' ORDER BY COALESCE(n.data_emissao, DATE(n.created_at)) DESC, n.id DESC';
    return (await Database.all(sql, p)).map(NotaFiscal.out);
  }

  /** Campos do formulário (criação/edição). */
  static async campos(inp, id) {
    const c = (k, n) => cut(str_or_null(inp[k] ?? null), n);
    const tipo = NotaFiscal.TIPOS.includes(inp.tipo ?? '') ? inp.tipo : 'entrada';
    const modelo = NotaFiscal.MODELOS.includes(inp.modelo ?? '') ? inp.modelo : null;
    const data = (!empty(inp.data_emissao) && /^\d{4}-\d{2}-\d{2}$/.test(String(inp.data_emissao))) ? inp.data_emissao : null;
    const valor = round(num(String(inp.valor ?? 0).replace(/,/g, '.')), 2);
    if (valor < 0) throw new HttpException(400, 'O valor da nota não pode ser negativo');
    let chave = c('chave', 60);
    if (chave && /^\d[\d\s.-]+$/.test(chave)) chave = only_digits(chave);
    if (chave && chave.length === 44) {
      const dup = await NotaFiscal.comChave(chave, id);
      if (dup) throw new HttpException(400, 'Já existe uma nota com essa chave de acesso (nº ' + (dup.numero || dup.id) + ')');
    }
    const doc = (k) => { const d = only_digits(String(inp[k] ?? '')); return d !== '' ? d.slice(0, 20) : null; };
    return {
      tipo, modelo, numero: c('numero', 20), serie: c('serie', 10), chave,
      data_emissao: data, valor,
      emitente_nome: c('emitente_nome', 255), emitente_doc: doc('emitente_doc'),
      destinatario_nome: c('destinatario_nome', 255), destinatario_doc: doc('destinatario_doc'),
      descricao: c('descricao', 255), observacoes: str_or_null(inp.observacoes ?? null),
    };
  }

  static async comChave(chave, ignorar = null) {
    return Database.one('SELECT id, numero FROM notas_fiscais WHERE chave=?' + (ignorar ? ' AND id<>?' : ''), ignorar ? [chave, ignorar] : [chave]);
  }

  /** Lançamento apagado: a nota continua, só perde o vínculo. */
  static async desvincularLancamento(txId) {
    await Database.run('UPDATE notas_fiscais SET transaction_id=NULL WHERE transaction_id=?', [txId]);
  }

  // ─── Sugestões a partir do XML ──────────────────────────────────────────
  static async fornecedorPorDoc(doc) {
    if (!doc) return null;
    const n = await Database.value('SELECT nome FROM fornecedores WHERE ' + sqlDoc('cnpj_cpf') + '=? ORDER BY ativo DESC LIMIT 1', [doc]);
    return n ? String(n) : null;
  }

  static async clientePorDoc(doc) {
    if (!doc) return null;
    const n = await Database.value('SELECT nome FROM clientes WHERE ' + sqlDoc('cnpj_cpf') + '=? LIMIT 1', [doc]);
    return n ? String(n) : null;
  }

  /**
   * CNPJ da própria empresa: o do .env (EMPRESA_CNPJ) ou, sem ele, o que mais aparece como destinatário
   * das notas de entrada / emitente das notas de saída já cadastradas.
   */
  static async cnpjEmpresa() {
    const e = only_digits(String(env('EMPRESA_CNPJ', '')));
    if (e !== '') return e;
    const doc = await Database.value(`SELECT doc FROM (
        SELECT destinatario_doc AS doc FROM notas_fiscais WHERE tipo='entrada' AND destinatario_doc IS NOT NULL
        UNION ALL SELECT emitente_doc FROM notas_fiscais WHERE tipo='saida' AND emitente_doc IS NOT NULL
      ) x GROUP BY doc ORDER BY COUNT(*) DESC LIMIT 1`);
    return doc ? String(doc) : null;
  }

  /**
   * Entrada ou saída? 1) CNPJ da empresa (.env ou deduzido das notas), 2) emitente é fornecedor cadastrado → entrada,
   * 3) destinatário é cliente cadastrado → saída, 4) na dúvida, entrada (nota recebida de fornecedor é o caso mais comum).
   */
  static async sugerirTipo(x) {
    const empresa = await NotaFiscal.cnpjEmpresa();
    if (empresa) {
      if ((x.emitente_doc ?? null) === empresa) return 'saida';
      if ((x.destinatario_doc ?? null) === empresa) return 'entrada';
    }
    if (await NotaFiscal.fornecedorPorDoc(x.emitente_doc ?? null)) return 'entrada';
    if (await NotaFiscal.clientePorDoc(x.destinatario_doc ?? null)) return 'saida';
    return 'entrada';
  }

  /**
   * Dados pra abrir o formulário de lançamento já preenchido.
   * xml = resultado do NotaFiscalXml (duplicatas e formas de pagamento), quando a nota tem XML.
   */
  static async sugerirLancamento(nf, xml = null) {
    const FormaPagamento = require('./FormaPagamento');
    const entrada = nf.tipo === 'entrada';
    const pessoa = entrada
      ? ((await NotaFiscal.fornecedorPorDoc(nf.emitente_doc)) ?? (xml?.emitente_fantasia ?? null) ?? nf.emitente_nome)
      : ((await NotaFiscal.clientePorDoc(nf.destinatario_doc)) ?? nf.destinatario_nome);
    const nfTxt = ((nf.modelo || 'NF') + ' ' + (nf.numero || '')).trim();
    const nomeOutro = entrada ? nf.emitente_nome : nf.destinatario_nome;
    const desc = nfTxt + (nf.descricao ? ' — ' + nf.descricao : (nomeOutro ? ' — ' + nomeOutro : ''));

    const dups = (xml?.duplicatas ?? []).filter((d) => d.vencimento).sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0));
    const h = hoje();
    const futuro = dups.length > 0 && dups[dups.length - 1].vencimento >= h;
    const obs = [];
    if (dups.length > 1) obs.push('Parcelas: ' + dups.map((d) => (d.numero || '') + ' venc. ' + data_br(d.vencimento) + ' ' + brl(d.valor)).join('; '));
    if (nf.chave) obs.push('Chave: ' + nf.chave);

    let forma = null;
    for (const p of xml?.pagamentos ?? []) if (p.tipo && (forma = await FormaPagamento.ativaDoTipo(p.tipo))) break;
    if (!forma && dups.length) forma = await FormaPagamento.ativaDoTipo('boleto');

    return {
      tipo: entrada ? 'expense' : 'income',
      data: nf.data_emissao || h,
      valor: float(nf.valor),
      descricao: mb_substr(desc, 0, 255),
      cliente_fornecedor: pessoa ? mb_substr(pessoa, 0, 255) : '',
      forma_pagamento: forma ?? '',
      status: futuro ? 'em_aberto' : 'quitado',
      data_vencimento: dups.length ? dups[0].vencimento : null,
      observacoes: obs.join(' · '),
      nota_fiscal_id: int(nf.id),
      titulo: 'Lançamento da ' + nfTxt,
    };
  }

  /**
   * Lançamentos que combinam com a nota (pra vincular): mesmo tipo, valor mais próximo e data mais perto primeiro.
   * soAberto = só contas a pagar/receber em aberto.
   */
  static async candidatos(nf, busca = '', soAberto = false, limite = 40) {
    const tipo = nf.tipo === 'entrada' ? 'expense' : 'income';
    let sql = `SELECT t.id, t.tipo, t.data, t.descricao, t.valor, t.status, t.data_vencimento, t.cliente_fornecedor, t.categoria_nome,
                      (SELECT COUNT(*) FROM notas_fiscais n WHERE n.transaction_id=t.id) AS qtd_nf
               FROM transactions t WHERE t.tipo=?`;
    const p = [tipo];
    if (soAberto) sql += " AND t.status='em_aberto'";
    if (busca !== '') {
      sql += ' AND (t.descricao LIKE ? OR t.cliente_fornecedor LIKE ? OR t.observacoes LIKE ?)';
      const b = `%${busca}%`; p.push(b, b, b);
    }
    const ref = nf.data_emissao || hoje();
    sql += ' ORDER BY ABS(t.valor - ?) ASC, ABS(DATEDIFF(t.data, ?)) ASC, t.id DESC LIMIT ' + int(limite);
    p.push(float(nf.valor), ref);
    return (await Database.all(sql, p)).map((r) => ({ ...r, id: int(r.id), valor: float(r.valor), qtd_nf: int(r.qtd_nf),
      mesmo_valor: Math.abs(float(r.valor) - float(nf.valor)) < 0.005 }));
  }
}

module.exports = NotaFiscal;
