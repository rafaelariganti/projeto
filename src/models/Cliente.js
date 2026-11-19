const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, doc_valido, fmt_doc, filter_email, int, float } = require('../helpers');

class Cliente extends Model {
  static table = 'clientes';

  static ROTULOS = { nome: 'nome', razao_social: 'razão social', cnpj_cpf: 'CPF/CNPJ', endereco: 'endereço',
    estado: 'estado', cidade: 'cidade', telefone: 'telefone', email: 'e-mail', observacoes: 'observações' };

  /** Com quantos lançamentos e quanto já recebeu (pelo nome, que é o que o lançamento guarda). */
  static async listar() {
    const rows = await Database.all(`SELECT c.*, COUNT(t.id) AS qtd_lanc, COALESCE(SUM(CASE WHEN t.tipo='income' THEN t.valor ELSE 0 END),0) AS total_receitas
        FROM clientes c LEFT JOIN transactions t ON t.cliente_fornecedor = c.nome
        GROUP BY c.id ORDER BY c.nome`);
    return rows.map((r) => ({ ...r, id: int(r.id), qtd_lanc: int(r.qtd_lanc), total_receitas: float(r.total_receitas) }));
  }

  static async campos(inp, id) {
    const nome = String(inp.nome ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Campo obrigatório: Nome');
    let doc = String(inp.cnpj_cpf ?? '').trim();
    if (doc !== '') {
      if (!doc_valido(doc)) throw new HttpException(400, 'CPF/CNPJ inválido — confira os números');
      doc = fmt_doc(doc);
      const dup = await Database.one('SELECT nome FROM clientes WHERE cnpj_cpf=?' + (id ? ' AND id<>?' : ''), id ? [doc, id] : [doc]);
      if (dup) throw new HttpException(400, `CPF/CNPJ já cadastrado para o cliente "${dup.nome}"`);
    }
    const email = str_or_null(inp.email ?? null);
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    const estado = str_or_null(inp.estado ?? null);
    return {
      nome: mb_substr(nome, 0, 255), razao_social: cut(str_or_null(inp.razao_social ?? null), 255),
      cnpj_cpf: doc || null, endereco: cut(str_or_null(inp.endereco ?? null), 255),
      estado: estado ? mb_substr(estado, 0, 50).toUpperCase() : null, cidade: cut(str_or_null(inp.cidade ?? null), 100),
      telefone: cut(str_or_null(inp.telefone ?? null), 30), email,
      observacoes: str_or_null(inp.observacoes ?? null),
    };
  }

  static async nomes() { return (await Database.all('SELECT nome FROM clientes ORDER BY nome')).map((r) => r.nome); }
}

module.exports = Cliente;
