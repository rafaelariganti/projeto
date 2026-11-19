/** Fornecedor: mesmo modelo de Parceiro (CNPJ/CPF, contrato, situação). */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, doc_valido, fmt_doc, filter_email, public_path, int } = require('../helpers');

class Fornecedor extends Model {
  static table = 'fornecedores';

  static out(f) {
    f = { ...f };
    f.id = int(f.id);
    f.ativo = int(f.ativo ?? 1);
    f.qtd_contratos = int(f.qtd_contratos ?? 0);
    f.contrato_path = public_path(f.contrato_path ?? null);
    return f;
  }

  static async listar() {
    return (await Database.all(`SELECT f.*, (SELECT COUNT(*) FROM documentos d WHERE d.fornecedor_id=f.id AND d.tipo='contrato_fornecedor') AS qtd_contratos
        FROM fornecedores f ORDER BY f.nome`)).map(Fornecedor.out);
  }

  /** exigirDoc=false na importação (planilhas antigas às vezes não têm o CNPJ). */
  static async campos(inp, id, exigirDoc = true) {
    const nome = String(inp.nome ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Campo obrigatório: Nome');
    let doc = String(inp.cnpj_cpf ?? '').trim();
    if (doc === '' && exigirDoc) throw new HttpException(400, 'Campo obrigatório: CNPJ/CPF');
    if (doc !== '') {
      if (!doc_valido(doc)) throw new HttpException(400, 'CNPJ/CPF inválido — confira os números');
      doc = fmt_doc(doc);
      const dup = id ? await Database.one('SELECT nome FROM fornecedores WHERE cnpj_cpf=? AND id<>?', [doc, id]) : await Database.one('SELECT nome FROM fornecedores WHERE cnpj_cpf=?', [doc]);
      if (dup) throw new HttpException(400, `CNPJ/CPF já cadastrado para o fornecedor "${dup.nome}"`);
    }
    const email = str_or_null(inp.email ?? null);
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    return {
      nome: mb_substr(nome, 0, 255), razao_social: cut(str_or_null(inp.razao_social ?? null), 255), cnpj_cpf: doc || null,
      email, endereco: cut(str_or_null(inp.endereco ?? null), 255),
      cidade: cut(str_or_null(inp.cidade ?? null), 100), estado: cut(str_or_null(inp.estado ?? null), 50),
      telefone: cut(str_or_null(inp.telefone ?? null), 30), whatsapp: cut(str_or_null(inp.whatsapp ?? null), 30),
      responsavel: cut(str_or_null(inp.responsavel ?? null), 150), observacoes: str_or_null(inp.observacoes ?? null),
      ativo: String(inp.ativo ?? '1') === '0' ? 0 : 1,
    };
  }

  static async nomesAtivos() { return (await Database.all('SELECT nome FROM fornecedores WHERE ativo=1 ORDER BY nome')).map((r) => r.nome); }
}

module.exports = Fornecedor;
