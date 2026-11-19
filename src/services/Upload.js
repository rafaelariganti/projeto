/**
 * Upload de arquivos com nome aleatório e lista de extensões permitidas.
 * O arquivo enviado chega num temporário (multer) e é guardado pelo Armazenamento
 * (pasta no disco ou tabela no banco, conforme ARMAZENAMENTO).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Request = require('../core/Request');
const Armazenamento = require('./Armazenamento');
const { HttpException } = require('../core/HttpException');
const { mb_substr } = require('../helpers');

const IMAGEM = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const DOCUMENTO = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'odt', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'xml', 'zip'];
const CONTRATO = ['pdf', 'doc', 'docx', 'odt', 'png', 'jpg', 'jpeg', 'webp'];

const extensao = (nome) => path.extname(String(nome || '')).replace(/^\./, '').toLowerCase();
const nomeAleatorio = (ext) => `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
const base = (n) => path.basename(String(n || '').replace(/\\/g, '/'));

function conteudo(f) {
  try { return fs.readFileSync(f.tmp_name); } catch { throw new HttpException(400, 'Falha no upload do arquivo'); }
}

/**
 * Salva em uploads/<pasta>/ e devolve { path: 'uploads/pasta/arq.ext', nome: 'nome original' } ou null
 * (quando o campo não veio). Não confia no nome vindo do navegador.
 */
async function salvar(campo, pasta, exts, maxBytes = 20 * 1024 * 1024) {
  let f = Request.file(campo);
  if (Array.isArray(f)) f = f[0];
  if (!f) return null;
  if (f.size > maxBytes) throw new HttpException(400, 'Arquivo muito grande (máx. ' + Math.round(maxBytes / 1048576) + ' MB)');
  const ext = extensao(f.name);
  if (!exts.includes(ext)) throw new HttpException(400, 'Tipo de arquivo não permitido (.' + ext + ')');
  const rel = `uploads/${pasta}/${nomeAleatorio(ext)}`;
  try { await Armazenamento.gravar(rel, conteudo(f)); } catch (e) {
    if (e instanceof HttpException) throw e;
    throw new HttpException(500, 'Não foi possível salvar o arquivo');
  }
  return { path: rel, nome: mb_substr(base(f.name), 0, 255) };
}

/**
 * Arquivo PRIVADO: grava em storage/<pasta>/ (o navegador não acessa direto; quem entrega é um controller
 * que confere a permissão). Recebe um item de arquivo (um só). Devolve { path, nome, ext }.
 * Valida o começo do arquivo (ex.: PDF tem que começar com %PDF) pra não aceitar arquivo renomeado.
 */
async function salvarPrivado(f, pasta, exts, maxBytes = 20 * 1024 * 1024) {
  if (!f || (f.error ?? 0) !== 0) throw new HttpException(400, 'Falha no upload do arquivo');
  if (f.size > maxBytes) throw new HttpException(400, 'Arquivo muito grande (máx. ' + Math.round(maxBytes / 1048576) + ' MB)');
  const ext = extensao(f.name);
  if (!exts.includes(ext)) throw new HttpException(400, 'Tipo de arquivo não permitido (.' + ext + ')');
  const buf = conteudo(f);
  const inicio = buf.subarray(0, 1024).toString('latin1');
  if (ext === 'pdf' && !inicio.includes('%PDF')) throw new HttpException(400, 'O arquivo "' + base(f.name) + '" não é um PDF válido');
  if (ext === 'xml' && inicio.replace(/^[\xEF\xBB\xBF \t\r\n]+/, '')[0] !== '<') throw new HttpException(400, 'O arquivo "' + base(f.name) + '" não é um XML válido');
  const rel = `storage/${pasta}/${nomeAleatorio(ext)}`;
  try { await Armazenamento.gravar(rel, buf); } catch { throw new HttpException(500, 'Não foi possível salvar o arquivo'); }
  return { path: rel, nome: mb_substr(base(f.name), 0, 255), ext };
}

/** Lista de arquivos de um campo múltiplo (name="arquivos[]") — sempre um array. */
function lista(campo) {
  const f = Request.file(campo);
  if (!f) return [];
  return Array.isArray(f) ? f : [f];
}

/** Conteúdo do temporário de um arquivo enviado (sem guardar). */
function lerEnviado(f) { return conteudo(f); }

/** Conteúdo de um arquivo privado (só dentro de storage/) ou null. */
async function lerPrivado(p) {
  if (!p) return null;
  const rel = String(p).replace(/^\/+/, '');
  if (!rel.startsWith('storage/') || rel.includes('..')) return null;
  return Armazenamento.ler(rel);
}

/** Apaga um arquivo de upload (aceita caminho antigo com "/" na frente) ou arquivo privado de storage/notas e comprovantes. */
async function apagar(p) {
  if (!p) return;
  const rel = String(p).replace(/^\/+/, '');
  if (rel.includes('..')) return;
  if (!rel.startsWith('uploads/') && !rel.startsWith('storage/notas/') && !rel.startsWith('storage/comprovantes/')) return;
  await Armazenamento.apagar(rel);
}

module.exports = { IMAGEM, DOCUMENTO, CONTRATO, salvar, salvarPrivado, lista, lerEnviado, lerPrivado, apagar };
