/**
 * Context — guarda os dados da requisição atual (req, res, usuário, transação)
 * usando AsyncLocalStorage. Assim Models, Auth e Logger acessam "a requisição atual"
 * sem precisar receber req/res por parâmetro (igual às superglobais do PHP).
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function run(dados, fn) { return storage.run(dados, fn); }
function ctx() { return storage.getStore() || null; }

module.exports = { run, ctx, storage };
