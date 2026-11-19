const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const { HttpException } = require('../../core/HttpException');
const FormaPagamento = require('../../models/FormaPagamento');
const { nome_e_mudancas, diff_log, int, empty } = require('../../helpers');

class FormaPagamentoController extends Controller {
  async index() {
    await this.autorizar('cad-formas');
    return FormaPagamento.listar();
  }

  async store() {
    await this.autorizarEdicao('cad-formas');
    const f = await FormaPagamento.campos(this.body(), null);
    const id = await FormaPagamento.create(f);
    await this.log('create', 'formas_pagamento', id, `${f.nome} (${f.tipo})`);
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-formas');
    id = int(id);
    const atual = await FormaPagamento.findOrFail(id, 'Forma de pagamento não encontrada');
    const f = await FormaPagamento.campos(this.body(), id);
    await FormaPagamento.update(id, f);
    if (f.nome !== atual.nome) await Database.run('UPDATE transactions SET forma_pagamento_nome=? WHERE forma_pagamento_nome=?', [f.nome, atual.nome]);
    await this.log('update', 'formas_pagamento', id, nome_e_mudancas(f.nome, diff_log(atual, f, FormaPagamento.ROTULOS)));
    return { ok: true };
  }

  /** Inativar / reativar: some dos novos lançamentos, mas os antigos e os relatórios continuam com ela. */
  async situacao(id) {
    await this.autorizarEdicao('cad-formas');
    id = int(id);
    const row = await FormaPagamento.findOrFail(id, 'Forma de pagamento não encontrada');
    const ativo = !empty(this.input('ativo')) ? 1 : 0;
    if (ativo === int(row.ativo)) return { ok: true, ativo };
    await FormaPagamento.update(id, { ativo });
    await this.log('update', 'formas_pagamento', id, row.nome + (ativo ? ' — reativada' : ' — inativada'));
    return { ok: true, ativo };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-formas');
    id = int(id);
    const row = await FormaPagamento.findOrFail(id, 'Forma de pagamento não encontrada');
    const uso = await FormaPagamento.uso(row.nome);
    if (uso) throw new HttpException(400, `"${row.nome}" está em ${uso} lançamento(s). Apagar tiraria a taxa desses lançamentos dos relatórios — inative em vez de apagar.`);
    await FormaPagamento.delete(id);
    await this.log('delete', 'formas_pagamento', id, row.nome, null, row);
    return { ok: true };
  }
}

module.exports = FormaPagamentoController;
