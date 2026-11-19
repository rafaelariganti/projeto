/** Entrega um arquivo do disco (inline ou download) e encerra a requisição. */
const fs = require('fs');
const { ctx } = require('./Context');
const { Encerrar } = require('./HttpException');

function enviar(full, mime, nome, { download = false, headers = {} } = {}) {
  const res = ctx().res;
  const limpo = String(nome).replace(/["\r\n]/g, '');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${limpo.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(limpo)}`);
  res.setHeader('Content-Length', fs.statSync(full).size);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  fs.createReadStream(full).pipe(res);
  throw new Encerrar();
}

module.exports = { enviar };
