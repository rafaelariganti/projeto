/** Nível de acesso (perfil): conjunto de telas com "ver" ou "editar". */
const Model = require('../core/Model');
const Database = require('../core/Database');
const Request = require('../core/Request');
const Permissions = require('../core/Permissions');
const { HttpException } = require('../core/HttpException');
const { cut, str_or_null, mb_substr, int } = require('../helpers');

class Perfil extends Model {
  static table = 'perfis';

  static async listar() {
    const rows = await Database.all(`SELECT p.*, (SELECT COUNT(*) FROM users u WHERE u.perfil_id=p.id) AS qtd_usuarios
        FROM perfis p ORDER BY p.is_admin DESC, p.sistema DESC, p.nome`);
    return rows.map(Perfil.out);
  }

  static out(p) {
    const admin = int(p.is_admin) === 1;
    return {
      id: int(p.id), nome: p.nome, descricao: p.descricao,
      is_admin: admin, sistema: int(p.sistema) === 1,
      permissoes: admin ? Permissions.todas() : Permissions.normalizar(p.permissoes),
      qtd_usuarios: int(p.qtd_usuarios ?? 0), created_at: p.created_at,
    };
  }

  /** Campos validados do formulário. */
  static async campos(id) {
    let nome = String(Request.input('nome', '') ?? '').trim();
    if (nome === '') throw new HttpException(400, 'Dê um nome para o nível de acesso');
    nome = mb_substr(nome, 0, 80);
    const dup = id ? await Database.one('SELECT id FROM perfis WHERE nome=? AND id<>?', [nome, id]) : await Database.one('SELECT id FROM perfis WHERE nome=?', [nome]);
    if (dup) throw new HttpException(400, 'Já existe um nível com esse nome');
    const perms = Permissions.normalizar(Request.input('permissoes', {}));
    if (!Object.values(perms).some((v) => v)) throw new HttpException(400, 'Libere pelo menos uma tela');
    return {
      nome,
      descricao: cut(str_or_null(Request.input('descricao')), 255),
      permissoes: JSON.stringify(perms),
    };
  }

  /** Texto curto das diferenças entre duas matrizes, pro log. */
  static diffPermissoes(antes, depois) {
    const rot = ['nenhum', 'ver', 'editar'];
    const m = [];
    for (const [k, t] of Object.entries(Permissions.TELAS)) {
      const a = int(antes[k] ?? 0); const d = int(depois[k] ?? 0);
      if (a !== d) m.push(`${t[0]}: ${rot[a]} → ${rot[d]}`);
    }
    return m.join('; ');
  }
}

module.exports = Perfil;
