/**
 * routes.js — todas as rotas do sistema.
 * Páginas (HTML) ficam embaixo; a API (JSON) usada pelas telas fica em /api/*.
 */
const AuthController = require('./controllers/api/AuthController');
const CadastroController = require('./controllers/api/CadastroController');
const CaixaController = require('./controllers/api/CaixaController');
const CategoriaController = require('./controllers/api/CategoriaController');
const ClienteController = require('./controllers/api/ClienteController');
const DocumentoController = require('./controllers/api/DocumentoController');
const DreController = require('./controllers/api/DreController');
const ExportController = require('./controllers/api/ExportController');
const FormaPagamentoController = require('./controllers/api/FormaPagamentoController');
const FornecedorController = require('./controllers/api/FornecedorController');
const ImportacaoController = require('./controllers/api/ImportacaoController');
const LogController = require('./controllers/api/LogController');
const NotaFiscalController = require('./controllers/api/NotaFiscalController');
const PageController = require('./controllers/PageController');
const ParceiroController = require('./controllers/api/ParceiroController');
const PerfilController = require('./controllers/api/PerfilController');
const TransacaoController = require('./controllers/api/TransacaoController');
const UsuarioController = require('./controllers/api/UsuarioController');

/** @param {import('./core/Router')} router */
module.exports = function rotas(router) {
  // ─── Autenticação ───────────────────────────────────────────────────────────
  router.get('api/auth/setup-status', [AuthController, 'setupStatus']);
  router.post('api/auth/register', [AuthController, 'register']);
  router.post('api/auth/login', [AuthController, 'login']);
  router.post('api/auth/logout', [AuthController, 'logout']);
  router.get('api/auth/me', [AuthController, 'me']);
  router.post('api/auth/trocar-senha', [AuthController, 'trocarSenha']);
  router.add('POST|PUT', 'api/auth/profile', [AuthController, 'perfil']);
  router.post('api/auth/aceitar-termos', [AuthController, 'aceitarTermos']);

  // ─── Relatórios ─────────────────────────────────────────────────────────────
  router.get('api/dre', [DreController, 'dashboard']);
  router.get('api/dre/resumo', [DreController, 'resumo']);
  router.get('api/dre/detalhado', [DreController, 'detalhado']);
  router.get('api/dre/demonstrativo', [DreController, 'demonstrativo']);
  router.get('api/dre/fluxo-caixa', [DreController, 'fluxoCaixa']);
  router.get('api/dre/formas-pagamento', [DreController, 'formasPagamento']);
  router.get('api/agenda', [DreController, 'agenda']);

  // ─── Lançamentos e transferências ───────────────────────────────────────────
  router.get('api/transactions', [TransacaoController, 'index']);
  router.get('api/transactions/em-aberto', [TransacaoController, 'emAberto']);
  router.post('api/transactions', [TransacaoController, 'store']);
  router.put('api/transactions/:id', [TransacaoController, 'update']);
  router.patch('api/transactions/:id', [TransacaoController, 'patch']);
  router.delete('api/transactions/:id', [TransacaoController, 'destroy']);
  router.get('api/transactions/:id/comprovante', [TransacaoController, 'verComprovante']);
  router.post('api/transactions/:id/comprovante', [TransacaoController, 'anexarComprovante']);
  router.delete('api/transactions/:id/comprovante', [TransacaoController, 'removerComprovante']);
  router.get('api/transfers', [TransacaoController, 'transferencias']);
  router.post('api/transfers', [TransacaoController, 'criarTransferencia']);
  router.delete('api/transfers/:id', [TransacaoController, 'apagarTransferencia']);

  // ─── Notas fiscais (rotas fixas antes das que têm :id) ──────────────────────
  router.get('api/notas-fiscais', [NotaFiscalController, 'index']);
  router.post('api/notas-fiscais', [NotaFiscalController, 'store']);
  router.post('api/notas-fiscais/ler-xml', [NotaFiscalController, 'lerXml']);
  router.post('api/notas-fiscais/lote', [NotaFiscalController, 'lote']);
  router.get('api/notas-fiscais/:id', [NotaFiscalController, 'show']);
  router.add('POST|PUT', 'api/notas-fiscais/:id', [NotaFiscalController, 'update']);
  router.delete('api/notas-fiscais/:id', [NotaFiscalController, 'destroy']);
  router.get('api/notas-fiscais/:id/arquivo/:qual', [NotaFiscalController, 'arquivo']);
  router.delete('api/notas-fiscais/:id/arquivo/:qual', [NotaFiscalController, 'removerArquivo']);
  router.get('api/notas-fiscais/:id/xml', [NotaFiscalController, 'xml']);
  router.patch('api/notas-fiscais/:id/vinculo', [NotaFiscalController, 'vincular']);
  router.get('api/notas-fiscais/:id/candidatos', [NotaFiscalController, 'candidatos']);
  router.get('api/notas-fiscais/:id/lancamento', [NotaFiscalController, 'sugestaoLancamento']);

  // ─── Cadastros ──────────────────────────────────────────────────────────────
  router.get('api/cadastros', [CadastroController, 'resumo']);
  for (const t of ['contas_receita', 'contas_despesa', 'centros_custo']) {
    router.get(`api/${t}`, [CadastroController, 'listar', t]);
    router.post(`api/${t}`, [CadastroController, 'criar', t]);
    router.put(`api/${t}/:id`, [CadastroController, 'atualizar', t]);
    router.delete(`api/${t}/:id`, [CadastroController, 'apagar', t]);
  }

  router.get('api/clientes', [ClienteController, 'index']);
  router.post('api/clientes', [ClienteController, 'store']);
  router.put('api/clientes/:id', [ClienteController, 'update']);
  router.delete('api/clientes/:id', [ClienteController, 'destroy']);

  router.get('api/fornecedores', [FornecedorController, 'index']);
  router.post('api/fornecedores', [FornecedorController, 'store']);
  router.add('POST|PUT', 'api/fornecedores/:id', [FornecedorController, 'update']);
  router.patch('api/fornecedores/:id/situacao', [FornecedorController, 'situacao']);
  router.delete('api/fornecedores/:id', [FornecedorController, 'destroy']);

  router.get('api/parceiros', [ParceiroController, 'index']);
  router.post('api/parceiros', [ParceiroController, 'store']);
  router.add('POST|PUT', 'api/parceiros/:id', [ParceiroController, 'update']);
  router.patch('api/parceiros/:id/situacao', [ParceiroController, 'situacao']);
  router.delete('api/parceiros/:id', [ParceiroController, 'destroy']);

  for (const t of ['parceiros', 'fornecedores']) {
    router.post(`api/${t}/:id/contrato`, [DocumentoController, 'anexarContrato', t]);
    router.delete(`api/${t}/:id/contrato`, [DocumentoController, 'removerContrato', t]);
  }
  router.get('api/documentos', [DocumentoController, 'index']);
  router.post('api/documentos', [DocumentoController, 'store']);
  router.delete('api/documentos/:id', [DocumentoController, 'destroy']);

  router.get('api/categorias', [CategoriaController, 'index']);
  router.post('api/categorias', [CategoriaController, 'store']);
  router.put('api/categorias/:id', [CategoriaController, 'update']);
  router.delete('api/categorias/:id', [CategoriaController, 'destroy']);

  router.get('api/caixas', [CaixaController, 'index']);
  router.post('api/caixas', [CaixaController, 'store']);
  router.put('api/caixas/:id', [CaixaController, 'update']);
  router.delete('api/caixas/:id', [CaixaController, 'destroy']);

  router.get('api/formas_pagamento', [FormaPagamentoController, 'index']);
  router.post('api/formas_pagamento', [FormaPagamentoController, 'store']);
  router.put('api/formas_pagamento/:id', [FormaPagamentoController, 'update']);
  router.patch('api/formas_pagamento/:id/situacao', [FormaPagamentoController, 'situacao']);
  router.delete('api/formas_pagamento/:id', [FormaPagamentoController, 'destroy']);

  // ─── Usuários e níveis de acesso (admin) ────────────────────────────────────
  router.get('api/users', [UsuarioController, 'index']);
  router.post('api/users', [UsuarioController, 'store']);
  router.put('api/users/:id', [UsuarioController, 'update']);
  router.post('api/users/:id/senha', [UsuarioController, 'senha']);
  router.patch('api/users/:id/situacao', [UsuarioController, 'situacao']);
  router.post('api/users/:id/desbloquear', [UsuarioController, 'desbloquear']);
  router.delete('api/users/:id', [UsuarioController, 'destroy']);

  router.get('api/perfis', [PerfilController, 'index']);
  router.post('api/perfis', [PerfilController, 'store']);
  router.put('api/perfis/:id', [PerfilController, 'update']);
  router.delete('api/perfis/:id', [PerfilController, 'destroy']);

  router.get('api/logs', [LogController, 'index']);
  router.get('api/logs/:id', [LogController, 'show']);

  // ─── Exportar / Importar ────────────────────────────────────────────────────
  router.get('api/export/excel', [ExportController, 'excel']);
  router.get('api/export/csv', [ExportController, 'csv']);
  router.get('api/export/xml', [ExportController, 'xml']);
  router.get('api/export/pdf', [ExportController, 'pdf']);
  router.get('api/export/dre-excel', [ExportController, 'dreExcel']);

  router.get('api/importacao', [ImportacaoController, 'index']);
  router.get('api/importacao/modelo', [ImportacaoController, 'modelo']);
  router.post('api/importacao/analisar', [ImportacaoController, 'analisar']);
  router.post('api/importacao/validar', [ImportacaoController, 'validar']);
  router.post('api/importacao/confirmar', [ImportacaoController, 'confirmar']);
  router.delete('api/importacao/:id', [ImportacaoController, 'desfazer']);

  // ─── Páginas ────────────────────────────────────────────────────────────────
  router.get('', [PageController, 'inicio']);
  router.get('login', [PageController, 'login']);
  router.get('privacidade', [PageController, 'privacidade']);
  router.get('termos', [PageController, 'termos']);
  router.get(':pagina', [PageController, 'pagina']);
};
