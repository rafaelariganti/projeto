const Ouvinte = require('../Ouvinte');
const Auth = require('../../core/Auth');
const Log = require('../../models/Log');
const NotaFiscal = require('../../models/NotaFiscal');
const { int, agora } = require('../../helpers');

/** Lançamento criado a partir de uma nota fiscal ("Gerar lançamento"): já deixa os dois vinculados. */
class VincularNotaFiscal extends Ouvinte {
  async ouvir(evento) {
    const nfId = int(evento.dados.nota_fiscal_id ?? 0);
    const txId = int(evento.dados.id);
    if (!nfId || !Auth.podeEditar('notas-fiscais') || !(await NotaFiscal.find(nfId))) return;
    await NotaFiscal.update(nfId, { transaction_id: txId, updated_at: agora() });
    await Log.registrar('vincular', 'notas_fiscais', nfId, `→ lançamento #${txId}`);
  }
}

module.exports = VincularNotaFiscal;
