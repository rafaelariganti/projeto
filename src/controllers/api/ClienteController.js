const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const Cliente = require('../../models/Cliente');
const { nome_e_mudancas, diff_log, int } = require('../../helpers');

class ClienteController extends Controller {
  async index() {
    await this.autorizar('cad-clientes', 'lancamentos');
    return Cliente.listar();
  }

  async store() {
    await this.autorizarEdicao('cad-clientes');
    const f = await Cliente.campos(this.body(), null);
    const id = await Cliente.create(f);
    await this.log('create', 'clientes', id, f.nome + (f.cnpj_cpf ? ` (${f.cnpj_cpf})` : ''));
    return { id };
  }

  async update(id) {
    await this.autorizarEdicao('cad-clientes');
    id = int(id);
    const atual = await Cliente.findOrFail(id, 'Cliente não encontrado');
    const f = await Cliente.campos(this.body(), id);
    await Cliente.update(id, f);
    // Lançamentos guardam o nome do cliente — mantém sincronizado ao renomear.
    if (f.nome !== atual.nome) await Database.run("UPDATE transactions SET cliente_fornecedor=? WHERE cliente_fornecedor=? AND tipo='income'", [f.nome, atual.nome]);
    await this.log('update', 'clientes', id, nome_e_mudancas(f.nome, diff_log(atual, f, Cliente.ROTULOS)));
    return { ok: true };
  }

  async destroy(id) {
    await this.autorizarEdicao('cad-clientes');
    id = int(id);
    const row = await Cliente.findOrFail(id, 'Cliente não encontrado');
    await Cliente.delete(id);
    await this.log('delete', 'clientes', id, row.nome + (row.cnpj_cpf ? ` (${row.cnpj_cpf})` : ''), null, row);
    return { ok: true };
  }
}

module.exports = ClienteController;
