/** Arquivos anexados: contratos/aditivos de parceiro e fornecedor, notas fiscais. */
const Model = require('../core/Model');
const Database = require('../core/Database');
const { public_path, int } = require('../helpers');

class Documento extends Model {
  static table = 'documentos';

  static TIPOS = ['contrato_parceiro', 'nota_fiscal', 'contrato_fornecedor'];

  static async listar(tipo, parceiroId, fornecedorId) {
    let sql = `SELECT d.*, p.nome AS parceiro_nome, f.nome AS fornecedor_nome FROM documentos d
               LEFT JOIN parceiros p ON p.id=d.parceiro_id LEFT JOIN fornecedores f ON f.id=d.fornecedor_id WHERE 1=1`;
    const p = [];
    if (tipo) { sql += ' AND d.tipo=?'; p.push(tipo); }
    if (parceiroId) { sql += ' AND d.parceiro_id=?'; p.push(parceiroId); }
    if (fornecedorId) { sql += ' AND d.fornecedor_id=?'; p.push(fornecedorId); }
    sql += ' ORDER BY d.created_at DESC, d.id DESC';
    return (await Database.all(sql, p)).map((d) => ({ ...d, id: int(d.id), arquivo_path: public_path(d.arquivo_path) }));
  }

  static async doParceiro(id) { return Database.all('SELECT id, arquivo_path FROM documentos WHERE parceiro_id=?', [id]); }
  static async doFornecedor(id) { return Database.all('SELECT id, arquivo_path FROM documentos WHERE fornecedor_id=?', [id]); }
}

module.exports = Documento;
