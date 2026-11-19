/** Resumo dos cadastros (alimenta os selects) + plano de contas e centros de custo. */
const Controller = require('../../core/Controller');
const Auth = require('../../core/Auth');
const Database = require('../../core/Database');
const { HttpException } = require('../../core/HttpException');
const Cadastro = require('../../models/Cadastro');
const Caixa = require('../../models/Caixa');
const Categoria = require('../../models/Categoria');
const Cliente = require('../../models/Cliente');
const FormaPagamento = require('../../models/FormaPagamento');
const Fornecedor = require('../../models/Fornecedor');
const { float, int } = require('../../helpers');

const unicos = (a) => [...new Set(a)];

class CadastroController extends Controller {
  async resumo() {
    await Auth.exigir();
    const cr = await Database.all('SELECT id, grupo, conta FROM contas_receita ORDER BY id');
    const cd = await Database.all('SELECT id, grupo, conta FROM contas_despesa ORDER BY id');
    const formas = await FormaPagamento.resumo();
    return {
      formasPagamento: formas.map((f) => f.nome),
      formasFull: formas.map((f) => ({ nome: f.nome, tipo: f.tipo, taxa_intermediacao: float(f.taxa_intermediacao), tarifa_fixa: float(f.tarifa_fixa) })),
      caixasBancos: await Caixa.nomes(),
      centrosCusto: (await Database.all('SELECT nome FROM centros_custo ORDER BY id')).map((r) => r.nome),
      gruposContasReceita: unicos(cr.map((r) => r.grupo)),
      gruposContasDespesa: unicos(cd.map((r) => r.grupo)),
      contasReceita: cr,
      contasDespesa: cd,
      clientes: await Cliente.nomes(),
      fornecedores: await Fornecedor.nomesAtivos(),
      categorias: await Categoria.ativas(),
    };
  }

  /** contas_receita / contas_despesa exigem Lançamentos (editar); centros de custo só login. */
  async tabela(t, editar) {
    if (!Cadastro.TABELAS[t]) throw new HttpException(404, 'Cadastro não encontrado');
    if (t === 'centros_custo') { if (editar) await this.autorizarEdicao('lancamentos'); else await Auth.exigir(); return; }
    if (editar) await this.autorizarEdicao('lancamentos'); else await this.autorizar('lancamentos', 'dre');
  }

  async listar(t) { await this.tabela(t, false); return Cadastro.listar(t); }

  async criar(t) {
    await this.tabela(t, true);
    const d = Cadastro.campos(t, this.body(), false);
    const id = await Cadastro.criar(t, d);
    await this.log('create', t, id, d.nome ?? d.grupo ?? null);
    return { id };
  }

  async atualizar(t, id) {
    await this.tabela(t, true);
    const d = Cadastro.campos(t, this.body(), true);
    await Cadastro.atualizar(t, int(id), d);
    await this.log('update', t, int(id), d.nome ?? d.grupo ?? null);
    return { ok: true };
  }

  async apagar(t, id) {
    await this.tabela(t, true);
    const row = await Cadastro.find(t, int(id));
    if (!row) throw new HttpException(404, 'Registro não encontrado');
    await Cadastro.apagar(t, int(id));
    await this.log('delete', t, int(id), row.nome ?? row.grupo ?? null, null, row);
    return { ok: true };
  }
}

module.exports = CadastroController;
