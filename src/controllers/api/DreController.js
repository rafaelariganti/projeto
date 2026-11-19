/** Relatórios: Dashboard, DRE, Fluxo de Caixa, agenda do Calendário. */
const Controller = require('../../core/Controller');
const Transacao = require('../../models/Transacao');
const DreService = require('../../services/DreService');
const { ano_param, int } = require('../../helpers');

const mesAtual = () => new Date().getMonth() + 1;

class DreController extends Controller {
  async dashboard() {
    await this.autorizar('dashboard');
    return DreService.dashboard(ano_param());
  }

  async resumo() {
    await this.autorizar('dre');
    return DreService.resumo(ano_param());
  }

  async detalhado() {
    await this.autorizar('dre');
    return DreService.detalhado(ano_param(), this.query('agrupar') === 'categoria');
  }

  /** Demonstrativo completo da tela DRE (mês a mês, AV%, comparação com o ano anterior). */
  async demonstrativo() {
    await this.autorizar('dre');
    return DreService.demonstrativo(ano_param(), String(this.query('agrupar', 'categoria')), String(this.query('regime', 'competencia')));
  }

  async fluxoCaixa() {
    await this.autorizar('fluxo-caixa');
    const m = Math.max(1, Math.min(12, int(this.query('month', mesAtual()))));
    return DreService.fluxoCaixa(ano_param(), m, this.query('caixa'));
  }

  async formasPagamento() {
    await this.autorizar('dre');
    return DreService.formasPagamento(ano_param());
  }

  /** Vencimentos do mês (Calendário; o Dashboard usa os "próximos"). */
  async agenda() {
    await this.autorizar('calendario', 'dashboard');
    const m = Math.max(1, Math.min(12, int(this.query('month', mesAtual()))));
    return Transacao.agenda(ano_param(), m);
  }
}

module.exports = DreController;
