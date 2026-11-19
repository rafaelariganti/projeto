const Model = require('../core/Model');
const Database = require('../core/Database');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, cnpj_valido, fmt_cnpj, filter_email, public_path, round, num, int, float } = require('../helpers');

class Parceiro extends Model {
  static table = 'parceiros';

  static OBRIGATORIOS = { nome: 'Nome', razao_social: 'Razão Social', cnpj: 'CNPJ', responsavel: 'Responsável', contato: 'Contato' };

  static out(p) {
    p = { ...p };
    p.id = int(p.id);
    p.comissao = float(p.comissao);
    p.qtd_contratos = int(p.qtd_contratos ?? 0);
    p.ativo = int(p.ativo ?? 1);
    for (const k of ['foto_path', 'contrato_path']) p[k] = public_path(p[k] ?? null);
    return p;
  }

  static async listar() {
    return (await Database.all(`SELECT p.*, (SELECT COUNT(*) FROM documentos d WHERE d.parceiro_id=p.id AND d.tipo='contrato_parceiro') AS qtd_contratos
        FROM parceiros p ORDER BY p.nome`)).map(Parceiro.out);
  }

  static async campos(inp, id) {
    for (const [k, label] of Object.entries(Parceiro.OBRIGATORIOS)) if (String(inp[k] ?? '').trim() === '') throw new HttpException(400, `Campo obrigatório: ${label}`);
    let cnpj = String(inp.cnpj);
    if (!cnpj_valido(cnpj)) throw new HttpException(400, 'CNPJ inválido — confira os números');
    cnpj = fmt_cnpj(cnpj);
    const dup = id ? await Database.one('SELECT nome FROM parceiros WHERE cnpj=? AND id<>?', [cnpj, id]) : await Database.one('SELECT nome FROM parceiros WHERE cnpj=?', [cnpj]);
    if (dup) throw new HttpException(400, `CNPJ já cadastrado para o parceiro "${dup.nome}"`);
    const email = str_or_null(inp.email ?? null);
    if (email && !filter_email(email)) throw new HttpException(400, 'E-mail inválido');
    return {
      nome: mb_substr(String(inp.nome).trim(), 0, 255), razao_social: mb_substr(String(inp.razao_social).trim(), 0, 255), cnpj,
      email, endereco: cut(str_or_null(inp.endereco ?? null), 255),
      comissao: Math.max(0, round(num(inp.comissao ?? 0), 2)), // nunca negativa
      contato: mb_substr(String(inp.contato).trim(), 0, 150), whatsapp: cut(str_or_null(inp.whatsapp ?? null), 30),
      responsavel: mb_substr(String(inp.responsavel).trim(), 0, 150), observacoes: str_or_null(inp.observacoes ?? null),
      ativo: String(inp.ativo ?? '1') === '0' ? 0 : 1,
    };
  }
}

module.exports = Parceiro;
