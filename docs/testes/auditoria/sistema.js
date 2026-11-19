// Saída do SISTEMA (mesmas funções que as telas usam) em JSON.
//   node docs/testes/auditoria/sistema.js > sistema.json
//   python3 docs/testes/auditoria/auditor.py NOME_DO_BANCO sistema.json
const path = require('path');
const raiz = path.resolve(__dirname, '../../..');
require(path.join(raiz, 'src/bootstrap'));
const Database = require(path.join(raiz, 'src/core/Database'));
const DreService = require(path.join(raiz, 'src/services/DreService'));
const Caixa = require(path.join(raiz, 'src/models/Caixa'));
const Transacao = require(path.join(raiz, 'src/models/Transacao'));

(async () => {
  const o = { dash: {}, dem: {}, det: {}, res: {}, fluxo: {}, caixas: await Caixa.comSaldo(), aberto: await Transacao.resumoEmAberto() };
  for (const y of [2024, 2025, 2026]) {
    o.dash[y] = await DreService.dashboard(y);
    o.res[y] = await DreService.resumo(y);
    o.det[y] = {};
    for (const a of ['categoria', 'grupo']) o.det[y][a] = await DreService.detalhado(y, a === 'categoria');
    o.dem[y] = {};
    for (const r of ['competencia', 'caixa']) { o.dem[y][r] = {}; for (const a of ['categoria', 'grupo', 'centro']) o.dem[y][r][a] = await DreService.demonstrativo(y, a, r); }
  }
  const cx = ['Todos', ...(await Caixa.nomes())];
  for (const y of [2025, 2026]) for (let m = 1; m <= 12; m++) for (const c of cx) o.fluxo[`${y}-${m}-${c}`] = await DreService.fluxoCaixa(y, m, c);
  process.stdout.write(JSON.stringify(o));
  await Database.fechar();
})();
