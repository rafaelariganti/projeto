/**
 * Dados fictícios pra testar o sistema (uma clínica de jan/2025 a dez/2026).
 *
 *   npm run dados                          → gera (só se ainda não houver lançamentos)
 *   npm run dados -- --limpar              → APAGA lançamentos, transferências, notas, clientes,
 *                                            fornecedores e parceiros e gera tudo de novo
 *   (ou direto: node src/database/DadosFicticios.js [--limpar] [--sim])
 *
 * O que é criado:
 *  - 3 contas + 1 aplicação, formas de pagamento com taxas reais de mercado, categorias e plano de contas
 *  - 30 clientes, 14 fornecedores (CPF/CNPJ válidos), 3 parceiros
 *  - ~2.000 lançamentos: consultas, procedimentos e convênios (receitas) e aluguel, folha, impostos,
 *    contas de consumo, software, marketing, materiais (despesas). Passado quitado (com alguns atrasados
 *    de propósito), meses futuros em aberto — o Calendário e o Fluxo previsto ficam cheios.
 *  - transferências (depósito do dinheiro da recepção e aplicação mensal)
 *  - ~40 notas fiscais com XML e PDF de verdade (NF-e de compra e NFS-e de convênio), a maioria vinculada,
 *    algumas sem vínculo e uma só com PDF, pra testar todas as telas
 *  - usuários de teste: financeiro / Demo1234 e consulta / Demo1234 (e admin / Admin1234 se o banco não tiver ninguém)
 *
 * Os números são gerados sempre iguais (semente fixa, mesmo mt_rand do PHP), então dá pra conferir o DRE à mão.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../bootstrap');
const Database = require('../core/Database');
const Termos = require('../core/Termos');
const Migrator = require('./Migrator');
const MtRand = require('./MtRand');
const Transacao = require('../models/Transacao');
const User = require('../models/User');
const PdfWriter = require('../services/Spreadsheet/PdfWriter');
const { only_digits, fmt_cnpj, number_format, round, int, float, hoje, agora, pad, mb_substr, env } = require('../helpers');

const INICIO = '2025-01-01';
const FIM = '2026-12-31';

// ─── Datas (mesmas regras do strtotime/date do PHP) ──────────────────────────
const partes = (d) => String(d).split('-').map(Number);
const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const somaDias = (d, n) => { const [y, m, dd] = partes(d); return fmt(new Date(y, m - 1, dd + n)); };
const somaMeses = (d, n) => { const [y, m, dd] = partes(d); return fmt(new Date(y, m - 1 + n, dd)); };
const diaSemana = (d) => { const [y, m, dd] = partes(d); const w = new Date(y, m - 1, dd).getDay(); return w === 0 ? 7 : w; }; // date('N')
const ultimoDia = (y, m) => new Date(y, m, 0).getDate();
const ts = (d) => { const [y, m, dd] = partes(d); return new Date(y, m - 1, dd).getTime() / 1000; };
const br = (d) => { const [y, m, dd] = partes(d); return `${pad(dd)}/${pad(m)}/${y}`; };
const f2 = (v) => Number(v).toFixed(2);
const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class DadosFicticios {
  constructor() {
    this.r = new MtRand(2026);
    this.hoje = hoje();
    this.nTx = 0;
    this.txMateriais = [];
    this.txConvenios = [];
    this.catCache = {};
  }

  rand(a, b) { return this.r.rand(a, b); }

  static async executar(limpar) { return new DadosFicticios().rodar(limpar); }

  async rodar(limpar) {
    await Migrator.migrar();
    if (limpar) await this.limpar();
    else if (int(await Database.value('SELECT COUNT(*) FROM transactions'))) {
      throw new Error('O banco já tem lançamentos. Use --limpar para apagar os dados de movimento e gerar de novo (ou aponte o .env para um banco de testes).');
    }
    await Database.transaction(async () => {
      await this.usuarios();
      await this.cadastros();
      await this.lancamentos();
      await this.transferencias();
    });
    const nf = await this.notas(); // arquivos em disco: fora da transação
    const conta = async (t) => int(await Database.value(`SELECT COUNT(*) FROM ${t}`));
    return {
      lancamentos: await conta('transactions'), transferencias: await conta('transfers'), notas: nf,
      clientes: await conta('clientes'), fornecedores: await conta('fornecedores'),
    };
  }

  async limpar() {
    for (const n of await Database.all('SELECT pdf_path, xml_path FROM notas_fiscais')) {
      for (const p of Object.values(n)) {
        if (p && String(p).startsWith('storage/notas/')) { try { fs.unlinkSync(path.join(config.ROOT_DIR, p)); } catch { /* já foi */ } }
      }
    }
    for (const t of ['notas_fiscais', 'transactions', 'transfers', 'documentos', 'importacoes', 'parceiros', 'fornecedores', 'clientes']) await Database.run(`DELETE FROM \`${t}\``);
  }

  // ─── Usuários de teste ──────────────────────────────────────────────────
  async usuarios() {
    const perfil = (nome) => Database.value('SELECT id FROM perfis WHERE nome=? LIMIT 1', [nome]);
    const criar = async (user, nome, senha, perfilId, termos) => {
      if (await Database.one('SELECT id FROM users WHERE username=?', [user])) return;
      await Database.run('INSERT INTO users (username, nome, email, password, role, perfil_id, ativo, senha_alterada_em, termos_versao, termos_aceitos_em) VALUES (?,?,?,?,?,?,1,NOW(),?,?)',
        [user, nome, `${user}@exemplo.com`, User.hash(senha), user === 'admin' ? 'admin' : 'user', perfilId,
          termos ? Termos.VERSAO : null, termos ? agora() : null]);
    };
    if (!int(await Database.value('SELECT COUNT(*) FROM users'))) await criar('admin', 'Administrador', 'Admin1234', await perfil('Administrador'), true);
    await criar('financeiro', 'Fernanda Lima (financeiro)', 'Demo1234', await perfil('Financeiro'), true);
    await criar('consulta', 'Carlos Souza (só consulta)', 'Demo1234', await perfil('Consulta'), false); // vê o aceite LGPD no 1º login
  }

  // ─── Cadastros ──────────────────────────────────────────────────────────
  async cadastros() {
    const caixas = [['Itaú', 'banco', 'Itaú', '0350', '12345-6', 15000], ['NU BANK', 'banco', 'Nubank', '0001', '9876543-2', 5000],
      ['Caixa da recepção', 'caixa', null, null, null, 800], ['Aplicação CDB', 'investimento', 'Itaú', '0350', '12345-6', 20000]];
    for (const [n, t, b, ag, ct, si] of caixas) {
      if (await Database.one('SELECT id FROM caixas WHERE nome=?', [n])) await Database.run('UPDATE caixas SET tipo=?, banco=?, agencia=?, conta=?, saldo_inicial=? WHERE nome=?', [t, b, ag, ct, si, n]);
      else await Database.run('INSERT INTO caixas (nome, tipo, banco, agencia, conta, saldo_inicial) VALUES (?,?,?,?,?,?)', [n, t, b, ag, ct, si]);
    }
    // nome, tipo, parcelas, dias p/ receber, taxa %, tarifa fixa
    const formas = [['PIX', 'pix', 1, 0, 0, 0], ['CARTÃO CRÉDITO', 'credito', 1, 30, 3.19, 0], ['CARTÃO DÉBITO', 'debito', 1, 1, 1.49, 0],
      ['BOLETO BANCÁRIO', 'boleto', 1, 2, 0, 2.50], ['DINHEIRO', 'dinheiro', 1, 0, 0, 0], ['TRANSFERÊNCIA BANCÁRIA (TED/DOC)', 'transferencia', 1, 0, 0, 0]];
    for (const [n, t, p, d, tx, tf] of formas) {
      if (await Database.one('SELECT id FROM formas_pagamento WHERE nome=?', [n])) {
        await Database.run('UPDATE formas_pagamento SET tipo=?, parcelas=?, dias_recebimento=?, taxa_intermediacao=?, tarifa_fixa=?, ativo=1 WHERE nome=?', [t, p, d, tx, tf, n]);
      } else await Database.run('INSERT INTO formas_pagamento (nome, tipo, parcelas, dias_recebimento, taxa_intermediacao, taxa_parcelamento, tarifa_fixa, ativo) VALUES (?,?,?,?,?,0,?,1)', [n, t, p, d, tx, tf]);
    }
    // Forma antiga, inativa (pra testar o reativar)
    if (!(await Database.one("SELECT id FROM formas_pagamento WHERE nome='CHEQUE'"))) {
      await Database.run("INSERT INTO formas_pagamento (nome, tipo, parcelas, dias_recebimento, ativo) VALUES ('CHEQUE','boleto',1,3,0)");
    }

    const cats = [['Consultas', 'income', '#147A4A'], ['Procedimentos', 'income', '#0E6E7A'], ['Convênios', 'income', '#2F5E7E'], ['Outras Receitas', 'income', '#6B5CA5'],
      ['Aluguel', 'expense', '#B33F3F'], ['Folha / Prestadores', 'expense', '#B98B2E'], ['Impostos', 'expense', '#B0577D'], ['Marketing', 'expense', '#1F5FBF'],
      ['Materiais', 'expense', '#5E6E63'], ['Energia, água e internet', 'expense', '#C26A2E'], ['Software', 'expense', '#4A4E9C'], ['Outras Despesas', 'expense', '#8D97AC']];
    for (const [n, t, c] of cats) if (!(await Database.one('SELECT id FROM categorias WHERE nome=? AND tipo=?', [n, t]))) await Database.run('INSERT INTO categorias (nome, tipo, cor, ativo) VALUES (?,?,?,1)', [n, t, c]);

    const nomes = ['Ana Paula Ribeiro', 'Bruno Carvalho', 'Camila Duarte', 'Diego Martins', 'Eduarda Nogueira', 'Felipe Andrade', 'Gabriela Costa', 'Henrique Lopes',
      'Isabela Fernandes', 'João Pedro Alves', 'Karina Moreira', 'Lucas Teixeira', 'Mariana Rocha', 'Nicolas Barbosa', 'Olívia Cardoso', 'Paulo Henrique Dias',
      'Rafaela Pinto', 'Samuel Freitas', 'Tatiane Gomes', 'Vinícius Araújo', 'Larissa Mendes', 'Gustavo Ramos', 'Beatriz Campos', 'Rodrigo Pires', 'Juliana Prado'];
    for (const n of nomes) {
      const cpf = DadosFicticios.fmtCpf(this.cpf());
      const fone = `(15) 9${pad(this.rand(1000, 9999), 4)}-${pad(this.rand(1000, 9999), 4)}`;
      await Database.run('INSERT INTO clientes (nome, cnpj_cpf, estado, cidade, telefone, email) VALUES (?,?,?,?,?,?)', [n, cpf, 'SP', 'Sorocaba', fone, DadosFicticios.email(n)]);
    }
    for (const n of ['Unimed Sorocaba', 'Bradesco Saúde', 'SulAmérica Saúde', 'Amil Assistência', 'Prefeitura de Votorantim (convênio)']) {
      await Database.run('INSERT INTO clientes (nome, razao_social, cnpj_cpf, estado, cidade) VALUES (?,?,?,?,?)', [n, n + ' LTDA', fmt_cnpj(this.cnpj()), 'SP', 'Sorocaba']);
    }

    const forn = [['Imobiliária Central', 'Imobiliária Central Sorocaba LTDA'], ['CPFL Paulista', 'Companhia Paulista de Força e Luz'], ['SAAE Sorocaba', 'Serviço Autônomo de Água e Esgoto'],
      ['Vivo Empresas', 'Telefônica Brasil S.A.'], ['Dental Med Distribuidora', 'Dental Med Distribuidora de Produtos Médicos LTDA'], ['Cirúrgica Paulista', 'Cirúrgica Paulista Comércio LTDA'],
      ['Papelaria Exemplo', 'Papelaria Exemplo LTDA'], ['Clinicorp Software', 'Clinicorp Sistemas de Gestão LTDA'], ['Agência Pulso Marketing', 'Pulso Comunicação Digital LTDA'],
      ['Contabilidade Silva', 'Silva & Associados Contabilidade'], ['Limpa Bem Serviços', 'Limpa Bem Serviços de Limpeza LTDA'], ['Dra. Renata Oliveira (PJ)', 'R. Oliveira Serviços Médicos LTDA'],
      ['Dr. Marcos Vieira (PJ)', 'M. Vieira Clínica Médica LTDA'], ['Receita Federal (DAS)', 'Simples Nacional']];
    for (const [n, r] of forn) {
      await Database.run('INSERT INTO fornecedores (nome, razao_social, cnpj_cpf, estado, cidade, email, ativo) VALUES (?,?,?,?,?,?,1)',
        [n, r, fmt_cnpj(this.cnpj()), 'SP', 'Sorocaba', DadosFicticios.email(n)]);
    }
    await Database.run("UPDATE fornecedores SET ativo=0 WHERE nome='Limpa Bem Serviços'"); // fornecedor desativado

    const parc = [['Laboratório Vida', 'Laboratório Vida Análises Clínicas LTDA', 10], ['Ótica Visão', 'Ótica Visão Sorocaba LTDA', 8], ['Farmácia Bem Estar', 'Bem Estar Drogaria LTDA', 5]];
    for (const [n, r, c] of parc) {
      const cnpj = fmt_cnpj(this.cnpj());
      const contato = `(15) 3${pad(this.rand(100, 999), 3)}-${pad(this.rand(1000, 9999), 4)}`;
      await Database.run('INSERT INTO parceiros (nome, razao_social, cnpj, email, comissao, contato, responsavel, ativo) VALUES (?,?,?,?,?,?,?,1)',
        [n, r, cnpj, DadosFicticios.email(n), c, contato, 'Responsável ' + n.split(' ')[0]]);
    }

    const cr = [['Atendimento particular', 'Consultas'], ['Atendimento particular', 'Procedimentos'], ['Convênios', 'Repasse de convênios']];
    const cd = [['Ocupação', 'Aluguel'], ['Pessoal', 'Prestadores médicos'], ['Pessoal', 'Equipe administrativa'], ['Tributos', 'Simples Nacional'],
      ['Consumo', 'Energia, água e internet'], ['Administrativo', 'Software e sistemas'], ['Comercial', 'Marketing digital'], ['Operacional', 'Materiais e insumos']];
    for (const [g, c] of cr) if (!(await Database.one('SELECT id FROM contas_receita WHERE grupo=? AND conta=?', [g, c]))) await Database.run('INSERT INTO contas_receita (grupo, conta) VALUES (?,?)', [g, c]);
    for (const [g, c] of cd) if (!(await Database.one('SELECT id FROM contas_despesa WHERE grupo=? AND conta=?', [g, c]))) await Database.run('INSERT INTO contas_despesa (grupo, conta) VALUES (?,?)', [g, c]);
  }

  // ─── Lançamentos ────────────────────────────────────────────────────────
  async cat(nome, tipo) {
    const k = `${nome}|${tipo}`;
    if (this.catCache[k] === undefined || this.catCache[k] === null) {
      this.catCache[k] = int(await Database.value('SELECT id FROM categorias WHERE nome=? AND tipo=?', [nome, tipo])) || null;
    }
    return this.catCache[k];
  }

  /** Grava usando a mesma regra do sistema (Transacao.campos calcula a taxa e o líquido). */
  async tx(d) {
    d.categoria_id = await this.cat(d.categoria, d.tipo);
    delete d.categoria;
    const f = await Transacao.campos(d);
    f.user_id = 1;
    this.nTx++;
    return Transacao.create(f);
  }

  /**
   * Situação de acordo com hoje: vencimento no futuro → em aberto; no passado → quitado,
   * menos uma pequena parte que fica atrasada de propósito (inadimplência / conta esquecida).
   */
  situacao(venc, chanceAtraso, diasPagamento = 0) {
    const pag = somaDias(venc, diasPagamento);
    if (pag > this.hoje) return { status: 'em_aberto', data_pagamento: null };
    const recente = ts(this.hoje) - ts(venc) < 75 * 86400; // atrasos só nos últimos ~2 meses
    if (recente && this.rand(1, 1000) <= chanceAtraso * 1000) return { status: 'em_aberto', data_pagamento: null };
    return { status: 'quitado', data_pagamento: pag };
  }

  static diaUtil(d) {
    while (diaSemana(d) >= 6) d = somaDias(d, 1);
    return d;
  }

  async lancamentos() {
    const clientes = (await Database.all("SELECT nome FROM clientes WHERE cnpj_cpf NOT LIKE '%/%' ORDER BY id")).map((r) => r.nome);
    const convenios = (await Database.all("SELECT nome FROM clientes WHERE cnpj_cpf LIKE '%/%' ORDER BY id")).map((r) => r.nome);
    const sorteia = (pesos) => {
      let r = this.rand(1, Object.values(pesos).reduce((a, b) => a + b, 0));
      for (const [k, p] of Object.entries(pesos)) { if ((r -= p) <= 0) return k; }
      return Object.keys(pesos)[0];
    };
    const formasRec = { PIX: 40, 'CARTÃO CRÉDITO': 30, 'CARTÃO DÉBITO': 20, DINHEIRO: 10 };
    const diasForma = { PIX: 0, 'CARTÃO CRÉDITO': 30, 'CARTÃO DÉBITO': 1, DINHEIRO: 0 };
    const caixaForma = (f) => (f === 'DINHEIRO' ? 'Caixa da recepção' : (f === 'PIX' ? 'NU BANK' : 'Itaú'));
    const SAZONAL = { 1: 0.85, 2: 0.9, 3: 1.05, 4: 1.0, 5: 1.05, 6: 0.95, 7: 0.9, 8: 1.05, 9: 1.05, 10: 1.1, 11: 1.05, 12: 0.85 };

    let [y, m] = partes(INICIO);
    const [yf, mf] = partes(FIM);
    let receitaMesAnterior = 38000.0;
    while (y < yf || (y === yf && m <= mf)) {
      const ult = ultimoDia(y, m);
      const sazonal = SAZONAL[m];
      const cresc = y === 2026 ? 1.12 : 1.0; // 2026 cresce ~12% sobre 2025 (aparece no AH% do DRE)
      let receitaMes = 0.0;

      // Receitas particulares: consultas e procedimentos, em dias úteis
      for (let d = 1; d <= ult; d++) {
        const data = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
        if (diaSemana(data) >= 6) continue;
        const x = this.rand(200, 400) / 100 * sazonal * cresc;
        const qtd = Math.floor(x) + (this.rand(1, 100) <= (x - Math.floor(x)) * 100 ? 1 : 0);
        for (let i = 0; i < qtd; i++) {
          const proc = this.rand(1, 100) <= 18;
          const valor = proc ? this.rand(80, 280) * 10 : [250, 300, 350, 400][this.rand(0, 3)];
          const forma = sorteia(formasRec);
          const s = this.situacao(data, forma === 'CARTÃO CRÉDITO' ? 0 : 0.02, diasForma[forma]);
          const cli = clientes[this.rand(0, clientes.length - 1)];
          await this.tx({
            tipo: 'income', data, valor, categoria: proc ? 'Procedimentos' : 'Consultas',
            descricao: (proc ? 'Procedimento' : 'Consulta') + ' — ' + cli,
            cliente_fornecedor: cli, forma_pagamento: forma, caixa_banco: caixaForma(forma),
            centro_custo: 'RECEITA OPERACIONAL', grupo: 'Atendimento particular', conta: proc ? 'Procedimentos' : 'Consultas',
            data_vencimento: somaDias(data, diasForma[forma]), ...s,
          });
          receitaMes += valor;
        }
      }
      // Convênios: faturados no fim do mês, recebidos em 30 dias por boleto (contas a receber)
      for (const conv of convenios.slice(0, 3)) {
        const valor = round(this.rand(250, 700) * 10 * sazonal * cresc, 2);
        const data = `${pad(y, 4)}-${pad(m)}-${pad(ult)}`;
        const venc = DadosFicticios.diaUtil(somaDias(data, 30));
        const s = this.situacao(venc, 0.25);
        const id = await this.tx({
          tipo: 'income', data, valor, categoria: 'Convênios',
          descricao: `Faturamento ${conv} ${pad(m)}/${y}`, cliente_fornecedor: conv, forma_pagamento: 'BOLETO BANCÁRIO',
          caixa_banco: 'Itaú', centro_custo: 'RECEITA COMUM', grupo: 'Convênios', conta: 'Repasse de convênios', data_vencimento: venc, ...s,
        });
        this.txConvenios.push({ id, cliente: conv, valor, data, venc, mes: m, ano: y });
        receitaMes += valor;
      }
      // Outras receitas: comissão de parceiros, a cada 2 meses
      if (m % 2 === 0) {
        const data = DadosFicticios.diaUtil(`${pad(y, 4)}-${pad(m)}-15`);
        const valor = this.rand(40, 120) * 10;
        await this.tx({
          tipo: 'income', data, valor, categoria: 'Outras Receitas', descricao: 'Comissão de parceiros (laboratório e ótica)',
          cliente_fornecedor: '', forma_pagamento: 'PIX', caixa_banco: 'NU BANK', centro_custo: 'RECEITA COMUM', data_vencimento: data, ...this.situacao(data, 0),
        });
      }

      // Despesas fixas
      const energia = this.rand(68000, 98000) / 100;
      const agua = this.rand(14000, 21000) / 100;
      const fixas = [
        [5, 'Folha / Prestadores', 'Dra. Renata Oliveira (PJ)', 'Repasse médico — Dra. Renata', 9500 * cresc, 'TRANSFERÊNCIA BANCÁRIA (TED/DOC)', 'Pessoal', 'Prestadores médicos'],
        [5, 'Folha / Prestadores', 'Dr. Marcos Vieira (PJ)', 'Repasse médico — Dr. Marcos', 8200 * cresc, 'TRANSFERÊNCIA BANCÁRIA (TED/DOC)', 'Pessoal', 'Prestadores médicos'],
        [5, 'Folha / Prestadores', '', 'Salários equipe recepção (2 pessoas)', 5600 * (y === 2026 ? 1.06 : 1), 'TRANSFERÊNCIA BANCÁRIA (TED/DOC)', 'Pessoal', 'Equipe administrativa'],
        [10, 'Aluguel', 'Imobiliária Central', 'Aluguel sala comercial', y === 2026 ? 4780 : 4500, 'BOLETO BANCÁRIO', 'Ocupação', 'Aluguel'],
        [12, 'Marketing', 'Agência Pulso Marketing', 'Gestão de redes sociais e anúncios', 1800, 'PIX', 'Comercial', 'Marketing digital'],
        [8, 'Software', 'Clinicorp Software', 'Sistema de agenda e prontuário', 389.90, 'CARTÃO CRÉDITO', 'Administrativo', 'Software e sistemas'],
        [15, 'Energia, água e internet', 'CPFL Paulista', 'Conta de energia', energia, 'BOLETO BANCÁRIO', 'Consumo', 'Energia, água e internet'],
        [18, 'Energia, água e internet', 'SAAE Sorocaba', 'Conta de água', agua, 'BOLETO BANCÁRIO', 'Consumo', 'Energia, água e internet'],
        [20, 'Energia, água e internet', 'Vivo Empresas', 'Internet e telefone', 249.90, 'BOLETO BANCÁRIO', 'Consumo', 'Energia, água e internet'],
        [20, 'Impostos', 'Receita Federal (DAS)', `Simples Nacional (DAS) ref. ${pad(m === 1 ? 12 : m - 1)}/${m === 1 ? y - 1 : y}`, round(receitaMesAnterior * 0.112, 2), 'BOLETO BANCÁRIO', 'Tributos', 'Simples Nacional'],
        [25, 'Outras Despesas', 'Contabilidade Silva', 'Honorários contábeis', 950, 'PIX', 'Administrativo', 'Software e sistemas'],
        [28, 'Outras Despesas', y === 2025 && m < 7 ? 'Limpa Bem Serviços' : '', 'Limpeza e conservação', 1100, 'PIX', 'Operacional', 'Materiais e insumos'],
      ];
      for (const [dia, cat, forn, desc, valor, forma, g, c] of fixas) {
        const venc = DadosFicticios.diaUtil(`${pad(y, 4)}-${pad(m)}-${pad(Math.min(dia, ult))}`);
        await this.tx({
          tipo: 'expense', data: venc, valor: round(valor, 2), categoria: cat, descricao: desc, cliente_fornecedor: forn,
          forma_pagamento: forma, caixa_banco: 'Itaú', centro_custo: cat === 'Impostos' ? 'DESPESAS DE IMPOSTOS' : (g === 'Pessoal' || g === 'Administrativo' ? 'DESPESAS ADMINISTRATIVAS' : 'DESPESAS OPERACIONAIS'),
          grupo: g, conta: c, data_vencimento: venc, ...this.situacao(venc, 0.06),
        });
      }
      // Materiais: 2 a 3 compras por mês, com nota fiscal (NF-e)
      for (let k = 0, n = this.rand(2, 3); k < n; k++) {
        const forn = ['Dental Med Distribuidora', 'Cirúrgica Paulista', 'Papelaria Exemplo'][k % 3];
        const data = DadosFicticios.diaUtil(`${pad(y, 4)}-${pad(m)}-${pad(this.rand(2, Math.min(26, ult)))}`);
        const valor = forn === 'Papelaria Exemplo' ? this.rand(18000, 52000) / 100 : this.rand(90000, 380000) / 100;
        const venc = DadosFicticios.diaUtil(somaDias(data, 28));
        const id = await this.tx({
          tipo: 'expense', data, valor, categoria: 'Materiais',
          descricao: (forn === 'Papelaria Exemplo' ? 'Material de escritório' : 'Materiais e insumos médicos') + ' — ' + forn, cliente_fornecedor: forn,
          forma_pagamento: 'BOLETO BANCÁRIO', caixa_banco: 'Itaú', centro_custo: 'DESPESAS OPERACIONAIS', grupo: 'Operacional', conta: 'Materiais e insumos',
          data_vencimento: venc, ...this.situacao(venc, 0.1),
        });
        this.txMateriais.push({ id, fornecedor: forn, valor, data, venc });
      }
      // Despesa pontual grande (equipamento) — mostra um mês com prejuízo no DRE
      if ((y === 2025 && m === 9) || (y === 2026 && m === 3)) {
        const data = DadosFicticios.diaUtil(`${pad(y, 4)}-${pad(m)}-10`);
        await this.tx({
          tipo: 'expense', data, valor: y === 2025 ? 48900 : 28000, categoria: 'Materiais',
          descricao: y === 2025 ? 'Aparelho de ultrassom (à vista)' : 'Reforma da sala 2', cliente_fornecedor: y === 2025 ? 'Cirúrgica Paulista' : '',
          forma_pagamento: 'TRANSFERÊNCIA BANCÁRIA (TED/DOC)', caixa_banco: 'Aplicação CDB', centro_custo: 'DESPESAS OPERACIONAIS', data_vencimento: data, ...this.situacao(data, 0),
        });
      }
      receitaMesAnterior = receitaMes;
      if (++m > 12) { m = 1; y++; }
    }
  }

  async transferencias() {
    let [y, m] = partes(INICIO);
    while (`${pad(y, 4)}-${pad(m)}-01` <= this.hoje) {
      const fimMes = `${pad(y, 4)}-${pad(m)}-${pad(ultimoDia(y, m))}`;
      // Depósito do dinheiro da recepção no Itaú
      const din = float(await Database.value("SELECT COALESCE(SUM(valor),0) FROM transactions WHERE caixa_nome='Caixa da recepção' AND tipo='income' AND status='quitado' AND YEAR(data)=? AND MONTH(data)=?", [y, m]));
      const dep = DadosFicticios.diaUtil(fimMes) > fimMes ? somaDias(fimMes, -2) : DadosFicticios.diaUtil(fimMes);
      if (din > 0 && dep <= this.hoje) {
        await Database.run('INSERT INTO transfers (data, descricao, valor, origem_nome, destino_nome, user_id) VALUES (?,?,?,?,?,1)',
          [dep, 'Depósito do dinheiro da recepção', round(din * 0.9, 2), 'Caixa da recepção', 'Itaú']);
      }
      // Aplicação mensal
      const apl = DadosFicticios.diaUtil(`${pad(y, 4)}-${pad(m)}-06`);
      if (apl <= this.hoje) await Database.run('INSERT INTO transfers (data, descricao, valor, origem_nome, destino_nome, user_id) VALUES (?,?,?,?,?,1)', [apl, 'Aplicação mensal', 4000, 'Itaú', 'Aplicação CDB']);
      // PIX recebido no Nubank: tudo vai pro Itaú no último dia útil (é de lá que saem as contas)
      const pixMes = float(await Database.value("SELECT COALESCE(SUM(valor),0) FROM transactions WHERE caixa_nome='NU BANK' AND tipo='income' AND status='quitado' AND YEAR(COALESCE(data_pagamento,data))=? AND MONTH(COALESCE(data_pagamento,data))=?", [y, m]));
      if (pixMes > 0 && dep <= this.hoje) await Database.run('INSERT INTO transfers (data, descricao, valor, origem_nome, destino_nome, user_id) VALUES (?,?,?,?,?,1)', [dep, 'Concentração de saldo no Itaú', round(pixMes, 2), 'NU BANK', 'Itaú']);
      if (++m > 12) { m = 1; y++; }
    }
  }

  // ─── Notas fiscais com XML e PDF ────────────────────────────────────────
  async notas() {
    fs.mkdirSync(path.join(config.STORAGE_DIR, 'notas'), { recursive: true, mode: 0o770 });
    const empresa = '11222333000181'; // CNPJ fictício da clínica (válido)
    const docDe = async (nome, tab) => only_digits(String(await Database.value(`SELECT cnpj_cpf FROM \`${tab}\` WHERE nome=?`, [nome]) ?? ''));
    let n = 0;
    // NF-e de compra (materiais) dos últimos 12 meses — 85% vinculadas, o resto pra testar "Vincular"
    const desde12 = somaMeses(this.hoje, -12);
    const compras = this.txMateriais.filter((t) => t.data <= this.hoje && t.data >= desde12);
    for (let i = 0; i < compras.length; i++) {
      const t = compras[i];
      const num = 4100 + i * 7;
      const cnpj = await docDe(t.fornecedor, 'fornecedores');
      const chave = DadosFicticios.chaveNfe(cnpj, t.data, num);
      const itens = t.fornecedor === 'Papelaria Exemplo' ? [['Papel A4 500 fls', 0.35], ['Toner HP 85A', 0.45], ['Canetas e pastas', 0.2]]
        : [['Luvas de procedimento cx 100', 0.3], ['Seringas descartáveis 10ml', 0.25], ['Gaze estéril pct', 0.2], ['Álcool 70% 1L', 0.25]];
      const dups = t.valor > 2000 ? [[t.venc, round(t.valor / 2, 2)], [somaDias(t.venc, 30), round(t.valor - round(t.valor / 2, 2), 2)]] : [[t.venc, t.valor]];
      const xml = DadosFicticios.xmlNfe(chave, num, t.data, cnpj, t.fornecedor, empresa, itens, t.valor, dups);
      const vinc = i % 7 !== 3;
      await this.gravarNota({
        tipo: 'entrada', modelo: 'NF-e', numero: String(num), serie: '1', chave, data_emissao: t.data, valor: t.valor,
        emitente_nome: t.fornecedor + ' LTDA', emitente_doc: cnpj, destinatario_nome: 'Clínica Demonstração LTDA', destinatario_doc: empresa,
        descricao: itens.slice(0, 2).map((x) => x[0]).join(', ') + ' e mais ' + (itens.length - 2) + ' ite' + (itens.length - 2 === 1 ? 'm' : 'ns'),
        transaction_id: vinc ? t.id : null,
      }, xml, `NF-e ${num}`, t.fornecedor, t.valor, chave, i % 5 !== 4);
      n++;
    }
    // NFS-e dos convênios (saída) dos últimos 6 meses
    const desde6 = somaMeses(this.hoje, -6);
    const conv = this.txConvenios.filter((t) => t.data <= this.hoje && t.data >= desde6);
    for (let i = 0; i < conv.length; i++) {
      const t = conv[i];
      const num = 900 + i;
      const h = crypto.createHash('md5').update(`nfse${num}`).digest('hex');
      const cod = (h.slice(0, 4) + '-' + h.slice(4, 8)).toUpperCase();
      const cnpj = await docDe(t.cliente, 'clientes');
      const desc = `Serviços médicos prestados a beneficiários — competência ${pad(t.mes)}/${t.ano}`;
      const xml = DadosFicticios.xmlNfse(num, cod, t.data, empresa, cnpj, t.cliente, t.valor, desc);
      await this.gravarNota({
        tipo: 'saida', modelo: 'NFS-e', numero: String(num), chave: cod, data_emissao: t.data, valor: t.valor,
        emitente_nome: 'Clínica Demonstração LTDA', emitente_doc: empresa, destinatario_nome: t.cliente + ' LTDA', destinatario_doc: cnpj,
        descricao: desc, transaction_id: i === 0 ? null : t.id,
      }, xml, `NFS-e ${num}`, t.cliente, t.valor, cod, true);
      n++;
    }
    // Uma nota só com PDF (recibo escaneado), sem dados — pra testar o "completar à mão"
    const pdf = DadosFicticios.pdfNota('Recibo avulso', 'Chaveiro Rápido', 180.00, this.hoje, '—', 'Cópia de chaves e troca de fechadura');
    const p = this.salvarArquivo(pdf, 'pdf');
    await Database.run('INSERT INTO notas_fiscais (tipo, modelo, numero, valor, descricao, pdf_path, pdf_nome, user_id) VALUES (?,?,?,?,?,?,?,1)',
      ['entrada', 'Outro', null, 0, 'recibo_chaveiro_escaneado', p, 'recibo_chaveiro_escaneado.pdf']);
    return n + 1;
  }

  async gravarNota(d, xml, titulo, quem, valor, chave, comPdf) {
    const px = this.salvarArquivo(xml, 'xml');
    const pp = comPdf ? this.salvarArquivo(DadosFicticios.pdfNota(titulo, quem, valor, d.data_emissao, chave, String(d.descricao ?? '')), 'pdf') : null;
    const nomeBase = titulo.replace(/ /g, '_').replace(/-/g, '').toLowerCase();
    await Database.insert(`INSERT INTO notas_fiscais (tipo, modelo, numero, serie, chave, data_emissao, valor, emitente_nome, emitente_doc, destinatario_nome, destinatario_doc,
        descricao, xml_path, xml_nome, pdf_path, pdf_nome, transaction_id, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    [d.tipo, d.modelo, d.numero, d.serie ?? null, d.chave, d.data_emissao, d.valor, d.emitente_nome, d.emitente_doc,
      d.destinatario_nome, d.destinatario_doc, mb_substr(String(d.descricao ?? ''), 0, 255), px, `${nomeBase}.xml`, pp, pp ? `${nomeBase}.pdf` : null, d.transaction_id]);
  }

  salvarArquivo(conteudo, ext) {
    const nome = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(config.STORAGE_DIR, 'notas', nome), conteudo);
    return `storage/notas/${nome}`;
  }

  static xmlNfe(chave, num, data, cnpjEmit, emit, cnpjDest, itens, total, dups) {
    let det = ''; let soma = 0.0;
    itens.forEach(([prod, parte], k) => {
      const v = k === itens.length - 1 ? round(total - soma, 2) : round(total * parte, 2); soma += v;
      det += `<det nItem="${k + 1}"><prod><cProd>${100 + k}</cProd><xProd>${escXml(prod)}</xProd><qCom>1.0000</qCom><vProd>${f2(v)}</vProd></prod></det>`;
    });
    let dup = '';
    dups.forEach(([venc, v], k) => { dup += `<dup><nDup>${pad(k + 1, 3)}</nDup><dVenc>${venc}</dVenc><vDup>${f2(v)}</vDup></dup>`; });
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00">`
      + `<ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>55</mod><serie>1</serie><nNF>${num}</nNF><dhEmi>${data}T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>`
      + `<emit><CNPJ>${cnpjEmit}</CNPJ><xNome>${escXml(emit)} LTDA</xNome><xFant>${escXml(emit)}</xFant></emit>`
      + `<dest><CNPJ>${cnpjDest}</CNPJ><xNome>Clínica Demonstração LTDA</xNome></dest>${det}`
      + `<total><ICMSTot><vProd>${f2(total)}</vProd><vNF>${f2(total)}</vNF></ICMSTot></total>`
      + `<cobr><fat><nFat>${num}</nFat><vOrig>${f2(total)}</vOrig><vLiq>${f2(total)}</vLiq></fat>${dup}</cobr>`
      + `<pag><detPag><tPag>15</tPag><vPag>${f2(total)}</vPag></detPag></pag>`
      + '<infAdic><infCpl>Documento fictício gerado para testes do sistema.</infCpl></infAdic></infNFe></NFe>'
      + `<protNFe><infProt><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`;
  }

  static xmlNfse(num, cod, data, cnpjPrest, cnpjToma, toma, valor, desc) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + `<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse versao="2.02"><InfNfse Id="nfse${num}">`
      + `<Numero>${num}</Numero><CodigoVerificacao>${cod}</CodigoVerificacao><DataEmissao>${data}T18:00:00</DataEmissao>`
      + `<ValoresNfse><BaseCalculo>${f2(valor)}</BaseCalculo><ValorLiquidoNfse>${f2(valor)}</ValorLiquidoNfse></ValoresNfse>`
      + `<PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>${cnpjPrest}</Cnpj></CpfCnpj></IdentificacaoPrestador><RazaoSocial>Clínica Demonstração LTDA</RazaoSocial></PrestadorServico>`
      + `<DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico><Servico><Valores><ValorServicos>${f2(valor)}</ValorServicos></Valores><Discriminacao>${escXml(desc)}</Discriminacao></Servico>`
      + `<Tomador><IdentificacaoTomador><CpfCnpj><Cnpj>${cnpjToma}</Cnpj></CpfCnpj></IdentificacaoTomador><RazaoSocial>${escXml(toma)} LTDA</RazaoSocial></Tomador>`
      + '</InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico></InfNfse></Nfse></CompNfse>';
  }

  /** PDF simples no estilo de um DANFE, com aviso de documento fictício. */
  static pdfNota(titulo, quem, valor, data, chave, desc) {
    const p = new PdfWriter(); p.addPage();
    p.rect(40, 40, 515, 60, '#0F213D');
    p.font(true, 18); p.text(56, 54, titulo, '#FFFFFF');
    p.font(false, 10); p.text(56, 80, 'DOCUMENTO FICTÍCIO — gerado para testes do OAF Controle Financeiro', '#C9A55F');
    let y = 130;
    for (const [k, v] of [['Emitente / tomador', quem], ['Data de emissão', br(data)], ['Valor total', 'R$ ' + number_format(valor, 2, ',', '.')],
      ['Chave / código', chave], ['Descrição', desc]]) {
      p.font(true, 10); p.text(56, y, k, '#7A7E98');
      p.font(false, 12); p.text(200, y, mb_substr(v, 0, 70));
      p.line(56, y + 22, 540, y + 22); y += 36;
    }
    return p.output();
  }

  // ─── Documentos fictícios válidos ───────────────────────────────────────
  cpf() {
    let n = ''; for (let i = 0; i < 9; i++) n += this.rand(0, 9);
    for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += Number(n[i]) * ((t + 1) - i); n += ((10 * s) % 11) % 10; }
    return n;
  }

  cnpj() {
    let n = ''; for (let i = 0; i < 8; i++) n += this.rand(0, 9); n += '0001';
    for (const pesos of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
      let s = 0; pesos.forEach((p, i) => { s += Number(n[i]) * p; });
      const r = s % 11; n += r < 2 ? 0 : 11 - r;
    }
    return n;
  }

  static chaveNfe(cnpj, data, num) {
    const [y, m] = partes(data);
    const base = '35' + String(y).slice(2) + pad(m) + String(cnpj).padStart(14, '0') + '55' + '001' + String(num).padStart(9, '0') + '1' + String((num * 7919) % 100000000).padStart(8, '0');
    let s = 0; let peso = 2;
    for (let i = base.length - 1; i >= 0; i--) { s += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
    const dv = 11 - (s % 11);
    return base + (dv >= 10 ? 0 : dv);
  }

  static fmtCpf(c) { return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`; }

  static email(n) {
    const ascii = String(n).normalize('NFD').replace(/[̀-ͯ]/g, '');
    return ascii.replace(/[^a-z0-9]+/gi, '.').toLowerCase().replace(/^\.+|\.+$/g, '') + '@exemplo.com';
  }
}

module.exports = DadosFicticios;

// ─── Linha de comando ────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const limpar = args.includes('--limpar');
  (async () => {
    if (limpar && !args.includes('--sim')) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const resp = await new Promise((r) => rl.question(`ATENÇÃO: --limpar apaga lançamentos, transferências, notas fiscais, clientes, fornecedores e parceiros do banco "${env('DB_NAME')}".\nDigite SIM para continuar: `, r));
      rl.close();
      if (String(resp).trim() !== 'SIM') { console.log('Cancelado.'); process.exit(1); }
    }
    const t = Date.now();
    const r = await DadosFicticios.executar(limpar);
    console.log(`Pronto em ${((Date.now() - t) / 1000).toFixed(1)} s: ${r.lancamentos} lançamentos, ${r.transferencias} transferências, ${r.notas} notas fiscais, ${r.clientes} clientes, ${r.fornecedores} fornecedores.`);
    const temAdmin = int(await Database.value("SELECT COUNT(*) FROM users WHERE username='admin'"));
    console.log('Usuários de teste: financeiro / Demo1234 · consulta / Demo1234' + (temAdmin ? ' · admin / Admin1234 (se foi criado agora)' : ''));
    await Database.fechar();
  })().catch(async (e) => { console.error('Erro: ' + e.message); await Database.fechar(); process.exit(1); });
}
