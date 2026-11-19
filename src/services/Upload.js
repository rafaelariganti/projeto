/** Upload de arquivos com nome aleatório e lista de extensões permitidas. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../bootstrap');
const Request = require('../core/Request');
const { HttpException } = require('../core/HttpException');
const { mb_substr } = require('../helpers');

const IMAGEM = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const DOCUMENTO = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'xml', 'zip'];
const CONTRATO = ['pdf', 'doc', 'docx', 'odt', 'png', 'jpg', 'jpeg', 'webp'];

const extensao = (nome) => path.extname(String(nome || '')).replace(/^\./, '').toLowerCase();
const nomeAleatorio = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
const base = (n) => path.basename(String(n || '').replace(/\\/g, '/'));

/** Move o temporário pro destino (rename e, se for outro disco, copia). */
function mover(origem, destino) {
  try { fs.renameSync(origem, destino); } catch { fs.copyFileSync(origem, destino); try { fs.unlinkSync(origem); } catch { /* ignora */ } }
}

/**
 * Salva em uploads/<pasta>/ e devolve { path: 'uploads/pasta/arq.ext', nome: 'nome original' } ou null
 * (quando o campo não veio). Não confia no nome vindo do navegador.
 */
function salvar(campo, pasta, exts, maxBytes = 20 * 1024 * 1024) {
  let f = Request.file(campo);
  if (Array.isArray(f)) f = f[0];
  if (!f) return null;
  if (f.size > maxBytes) throw new HttpException(400, 'Arquivo muito grande (máx. ' + Math.round(maxBytes / 1048576) + ' MB)');
  const ext = extensao(f.name);
  if (!exts.includes(ext)) throw new HttpException(400, 'Tipo de arquivo não permitido (.' + ext + ')');
  const dir = path.join(config.UPLOADS_DIR, pasta);
  fs.mkdirSync(dir, { recursive: true });
  const nome = nomeAleatorio(ext);
  try { mover(f.tmp_name, path.join(dir, nome)); } catch { throw new HttpException(500, 'Não foi possível salvar o arquivo'); }
  return { path: `uploads/${pasta}/${nome}`, nome: mb_substr(base(f.name), 0, 255) };
}

/**
 * Arquivo PRIVADO: grava em storage/<pasta>/ (o navegador não acessa direto; quem entrega é um controller
 * que confere a permissão). Recebe um item de arquivo (um só). Devolve { path, nome, ext }.
 * Valida o começo do arquivo (ex.: PDF tem que começar com %PDF) pra não aceitar arquivo renomeado.
 */
function salvarPrivado(f, pasta, exts, maxBytes = 20 * 1024 * 1024) {
  if (!f || (f.error ?? 0) !== 0) throw new HttpException(400, 'Falha no upload do arquivo');
  if (f.size > maxBytes) throw new HttpException(400, 'Arquivo muito grande (máx. ' + Math.round(maxBytes / 1048576) + ' MB)');
  const ext = extensao(f.name);
  if (!exts.includes(ext)) throw new HttpException(400, 'Tipo de arquivo não permitido (.' + ext + ')');
  let inicio = '';
  try {
    const fd = fs.openSync(f.tmp_name, 'r');
    const buf = Buffer.alloc(1024);
    const n = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    inicio = buf.subarray(0, n).toString('latin1');
  } catch { /* vazio */ }
  if (ext === 'pdf' && !inicio.includes('%PDF')) throw new HttpException(400, 'O arquivo "' + base(f.name) + '" não é um PDF válido');
  if (ext === 'xml' && inicio.replace(/^[\xEF\xBB\xBF \t\r\n]+/, '')[0] !== '<') throw new HttpException(400, 'O arquivo "' + base(f.name) + '" não é um XML válido');
  const dir = path.join(config.STORAGE_DIR, pasta);
  fs.mkdirSync(dir, { recursive: true, mode: 0o770 });
  const nome = nomeAleatorio(ext);
  try { mover(f.tmp_name, path.join(dir, nome)); } catch { throw new HttpException(500, 'Não foi possível salvar o arquivo'); }
  return { path: `storage/${pasta}/${nome}`, nome: mb_substr(base(f.name), 0, 255), ext };
}

/** Lista de arquivos de um campo múltiplo (name="arquivos[]") — sempre um array. */
function lista(campo) {
  const f = Request.file(campo);
  if (!f) return [];
  return Array.isArray(f) ? f : [f];
}

/** Caminho absoluto de um arquivo privado (só dentro de storage/, sem "..") ou null. */
function caminhoPrivado(p) {
  if (!p) return null;
  const rel = String(p).replace(/^\/+/, '');
  if (!rel.startsWith('storage/') || rel.includes('..')) return null;
  const full = path.join(config.ROOT_DIR, rel);
  try { return fs.statSync(full).isFile() ? full : null; } catch { return null; }
}

/** Apaga um arquivo de upload (aceita caminho antigo com "/" na frente) ou arquivo privado de storage/notas. */
function apagar(p) {
  if (!p) return;
  const rel = String(p).replace(/^\/+/, '');
  if (rel.includes('..')) return;
  if (!rel.startsWith('uploads/') && !rel.startsWith('storage/notas/') && !rel.startsWith('storage/comprovantes/')) return;
  const full = path.join(config.ROOT_DIR, rel);
  try { if (fs.statSync(full).isFile()) fs.unlinkSync(full); } catch { /* não existe */ }
}

module.exports = { IMAGEM, DOCUMENTO, CONTRATO, salvar, salvarPrivado, lista, caminhoPrivado, apagar };
