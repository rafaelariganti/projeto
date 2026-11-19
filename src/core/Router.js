/**
 * Router: liga "MÉTODO caminho" a um [ControllerClass, 'metodo'].
 * Parâmetros no caminho com ":nome" (ex: "api/users/:id") viram argumentos do método.
 */
const { HttpException } = require('./HttpException');

class Router {
  constructor() { this.routes = []; }

  add(methods, pattern, action) {
    const limpo = String(pattern).replace(/^\/+|\/+$/g, '');
    const regex = new RegExp('^' + limpo.replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === ':' ? c : '\\' + c)).replace(/:([a-z_]+)/g, '([^/]+)') + '$');
    for (const m of String(methods).toUpperCase().split('|')) this.routes.push([m, regex, action]);
  }
  get(p, a) { this.add('GET', p, a); }
  post(p, a) { this.add('POST', p, a); }
  put(p, a) { this.add('PUT', p, a); }
  patch(p, a) { this.add('PATCH', p, a); }
  delete(p, a) { this.add('DELETE', p, a); }

  /** [action, params] ou [null, []]. Se o caminho existe com outro método → 405. */
  match(method, path) {
    let outroMetodo = false;
    for (const [m, regex, action] of this.routes) {
      const mm = path.match(regex);
      if (!mm) continue;
      if (m !== method) { outroMetodo = true; continue; }
      return [action, mm.slice(1)];
    }
    if (outroMetodo) throw new HttpException(405, 'Método não permitido');
    return [null, []];
  }

  async dispatch(action, params) {
    // Argumentos fixos depois do método (ex: [CadastroController, 'listar', 'contas_receita']) vêm antes dos da URL.
    const [Classe, metodo, ...fixos] = action;
    const ctrl = new Classe();
    if (typeof ctrl[metodo] !== 'function') throw new Error(`Método ${Classe.name}.${metodo} não existe`);
    return ctrl[metodo](...fixos, ...params);
  }
}

module.exports = Router;
