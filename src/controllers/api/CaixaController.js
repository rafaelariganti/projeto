const Controller = require('../../core/Controller');
const { HttpException } = require('../../core/HttpException');
const Caixa = require('../../models/Caixa');
const { brl, nome_e_mudancas, diff_log, int } = require('../../helpers');

class CaixaController extends Controller {
  async index() {
    await this.autorizar('cad-caixas');
    return { caixas: await Caixa.comSaldo(), sem_caixa: await Caixa.semCaixa() };
  }

  async store() {
    await this.autorizarEdicao('cad-caixas');
    const f = await Caixa.campos(this.body(), null);
    const id = await Caixa.create(f);
    await this.log('create', 'caixas', id, `${f.nome} — saldo inicial ` + brl(f.saldo_inicial));
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-caixas');
    id = int(id);
    const atual = await Caixa.findOrFail(id, 'Caixa não encontrado');
    const f = await Caixa.campos(this.body(), id);
    await Caixa.update(id, f);
    if (f.nome !== atual.nome) await Caixa.renomearReferencias(atual.nome, f.nome);
    await this.log('update', 'caixas', id, nome_e_mudancas(f.nome, diff_log(atual, f, Caixa.ROTULOS)));
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-caixas');
    id = int(id);
    const row = await Caixa.findOrFail(id, 'Caixa não encontrado');
    const uso = await Caixa.usoDoNome(row.nome);
    if (uso) throw new HttpException(400, `"${row.nome}" tem ${uso} movimentação(ões). Apagar faria o saldo sumir dos relatórios — renomeie em vez de apagar.`);
    await Caixa.delete(id);
    await this.log('delete', 'caixas', id, row.nome, null, row);
    return { ok: true };
  }
}

module.exports = CaixaController;
