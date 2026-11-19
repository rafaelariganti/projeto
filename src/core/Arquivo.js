/** Entrega um arquivo (conteúdo já lido) inline ou como download e encerra a requisição. */
const { ctx } = require('./Context');
const { Encerrar } = require('./HttpException');

function enviar(conteudo, mime, nome, { download = false, headers = {} } = {}) {
  const res = ctx().res;
  const limpo = String(nome).replace(/["\r\n]/g, '');
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${limpo.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(limpo)}`);
  res.setHeader('Content-Length', conteudo.length);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(conteudo);
  throw new Encerrar();
}

module.exports = { enviar };
