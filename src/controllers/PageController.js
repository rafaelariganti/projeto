/**
 * Páginas (HTML). Cada tela é uma view em src/views/pages/<rota>.ejs com o
 * layout src/views/layouts/app.ejs; os dados chegam pelo JS via /api/*.
 */
const Controller = require('../core/Controller');
const Auth = require('../core/Auth');
const Permissions = require('../core/Permissions');
const Response = require('../core/Response');
const Request = require('../core/Request');
const Termos = require('../core/Termos');
const View = require('../core/View');
const { HttpException } = require('../core/HttpException');
const User = require('../models/User');
const { int, e, fmt_cnpj } = require('../helpers');

/** Título e scripts de cada tela. */
const PAGINAS = {
  'dashboard': ['Dashboard', ['pages/dashboard.js']],
  'dre': ['DRE', ['pages/dre.js']],
  'calendario': ['Calendário', ['lancamento-form.js', 'pages/calendario.js']],
  'lancamentos': ['Lançamentos', ['lancamento-form.js', 'pages/lancamentos.js']],
  'notas-fiscais': ['Notas fiscais', ['lancamento-form.js', 'pages/notas-fiscais.js']],
  'fluxo-caixa': ['Fluxo de Caixa', ['pages/fluxo.js']],
  'importacao': ['Importar / Exportar', ['pages/importacao.js']],
  'clientes': ['Clientes', ['pages/clientes.js']],
  'fornecedores': ['Fornecedores', ['pages/entidades.js']],
  'parceiros': ['Parceiros', ['pages/entidades.js']],
  'categorias': ['Categorias', ['pages/categorias.js']],
  'caixas': ['Caixas / Banco', ['pages/caixas.js']],
  'formas': ['Formas de pagamento', ['pages/formas.js']],
  'usuarios': ['Usuários e acessos', ['pages/usuarios.js']],
  'logs': ['Logs', ['pages/logs.js']],
  'sem-acesso': ['Sem acesso', []],
};

class PageController extends Controller {
  async inicio() {
    Response.redirect((await Auth.check()) ? Auth.home() : 'login');
  }

  async login() {
    const u = await Auth.user();
    const trocar = !!u && !!int(u.deve_trocar_senha);
    const termos = !!u && !trocar && Termos.pendente(u);
    if (u && !trocar && !termos) Response.redirect(this.destino());
    View.render('auth/login', {
      titulo: 'Entrar',
      precisaSetup: (await User.count()) === 0,
      trocarSenha: trocar,
      aceitarTermos: termos,
      usuario: u,
      next: this.destino(false),
      scriptsAuth: ['pages/login.js'],
    }, 'layouts/auth');
  }

  /** LGPD — páginas públicas (abrem sem login, inclusive pelo link da tela de entrada). */
  async privacidade() { await this.documentoLgpd('privacidade', 'Política de privacidade'); }
  async termos() { await this.documentoLgpd('termos', 'Termo de uso e consentimento'); }

  async documentoLgpd(doc, titulo) {
    const controlador = e(Termos.controlador()) + (Termos.cnpj() ? ', CNPJ ' + e(fmt_cnpj(Termos.cnpj())) : '');
    const contato = Termos.email() ? '<a href="mailto:' + e(Termos.email()) + '">' + e(Termos.email()) + '</a>' : 'o administrador do sistema (menu <b>Usuários e acessos</b>)';
    View.render(`publico/${doc}`, { titulo, doc, logado: await Auth.check(), controlador, contato }, 'layouts/auth');
  }

  /** Destino seguro depois do login (?next=rota), só rotas internas conhecidas. */
  destino(padraoHome = true) {
    const next = String(Request.query('next', '') ?? '');
    if (next !== '' && PAGINAS[next] && next !== 'sem-acesso') return next;
    return padraoHome ? Auth.home() : '';
  }

  async pagina(rota) {
    if (!PAGINAS[rota]) throw new HttpException(404, 'Página não encontrada');
    const u = await Auth.user();
    if (!u) Response.redirect('login' + (rota !== 'sem-acesso' ? '?next=' + encodeURIComponent(rota) : ''));

    let tela;
    if (rota === 'usuarios') {
      if (!Auth.isAdmin()) this.negado();
      tela = null;
    } else if (rota === 'sem-acesso') {
      tela = null;
    } else {
      tela = Permissions.telaDaRota(rota);
      if (!tela || !Auth.pode(tela)) this.negado();
    }
    const [titulo, scripts] = PAGINAS[rota];
    View.render(`pages/${rota}`, {
      titulo, pagina: rota, tela, scripts,
      podeEditar: tela ? Auth.podeEditar(tela) : Auth.isAdmin(),
    });
  }

  negado() {
    Response.status(403);
    View.render('pages/sem-acesso', { titulo: 'Sem acesso', pagina: 'sem-acesso', tela: null, scripts: [], podeEditar: false, negado: true });
  }
}

module.exports = PageController;
