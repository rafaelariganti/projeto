/**
 * Notas fiscais: anexar, ver, substituir e remover PDF/XML; vincular a lançamento;
 * ler o XML pra preencher a nota e o lançamento; importar várias de uma vez.
 */
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const Controller = require('../../core/Controller');
const Auth = require('../../core/Auth');
const Arquivo = require('../../core/Arquivo');
const Database = require('../../core/Database');
const { HttpException } = require('../../core/HttpException');
const NotaFiscal = require('../../models/NotaFiscal');
const Transacao = require('../../models/Transacao');
const NotaFiscalXml = require('../../services/NotaFiscalXml');
const Upload = require('../../services/Upload');
const { diff_log, nome_e_mudancas, number_format, only_digits, mb_substr, agora, float, int, empty } = require('../../helpers');

const PASTA = 'notas';
const MAX_PDF = 15 * 1024 * 1024;
const MAX_XML = 5 * 1024 * 1024;
const MAX_LOTE = 20;
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const lerArquivo = (f) => Upload.lerEnviado(f);
const semExt = (nome) => path.basename(nome, path.extname(nome));

/** Reindenta o XML pra mostrar na tela (se não der, devolve como veio). */
function indentar(xml) {
  if (/<!DOCTYPE/i.test(xml)) return xml;
  try {
    let erro = false;
    const dom = new DOMParser({ onError: (n) => { if (n !== 'warning') erro = true; } }).parseFromString(xml, 'text/xml');
    if (erro || !dom.documentElement) return xml;
    const linhas = [];
    const decl = (xml.match(/^\s*(<\?xml[^>]*\?>)/) || [])[1] || '<?xml version="1.0"?>';
    linhas.push(decl);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escA = (s) => esc(s).replace(/"/g, '&quot;');
    const visitar = (n, nivel) => {
      const pad = '  '.repeat(nivel);
      const attrs = Array.from(n.attributes || []).map((a) => ` ${a.name}="${escA(a.value)}"`).join('');
      const elems = []; let texto = '';
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 1) elems.push(c);
        else if (c.nodeType === 3 || c.nodeType === 4) texto += c.nodeValue;
      }
      if (!elems.length) {
        const t = texto.trim();
        linhas.push(t === '' ? `${pad}<${n.nodeName}${attrs}/>` : `${pad}<${n.nodeName}${attrs}>${esc(t)}</${n.nodeName}>`);
        return;
      }
      linhas.push(`${pad}<${n.nodeName}${attrs}>`);
      for (const c of elems) visitar(c, nivel + 1);
      linhas.push(`${pad}</${n.nodeName}>`);
    };
    visitar(dom.documentElement, 0);
    return linhas.join('\n') + '\n';
  } catch { return xml; }
}

class NotaFiscalController extends Controller {
  async index() {
    await this.autorizar('notas-fiscais');
    return NotaFiscal.listar({
      tipo: this.query('tipo'), vinculo: this.query('vinculo'), year: this.query('year'),
      month: this.query('month'), busca: String(this.query('busca', '') ?? '').trim(), transaction_id: this.query('transaction_id'),
    });
  }

  async show(id) {
    await this.autorizar('notas-fiscais');
    return this.nota(int(id));
  }

  async nota(id) {
    const nf = await NotaFiscal.buscar(id);
    if (!nf) throw new HttpException(404, 'Nota fiscal não encontrada');
    return nf;
  }

  // ─── Ler XML sem gravar (preenche o formulário) ─────────────────────────
  async lerXml() {
    await this.autorizarEdicao('notas-fiscais');
    const f = Upload.lista('xml')[0] ?? null;
    if (!f) throw new HttpException(400, 'Escolha o arquivo XML da nota');
    if (f.error !== 0 || f.size > MAX_XML) throw new HttpException(400, 'Arquivo XML inválido ou muito grande (máx. 5 MB)');
    const dados = NotaFiscalXml.ler(lerArquivo(f));
    dados.tipo = await NotaFiscal.sugerirTipo(dados);
    dados.duplicada = dados.chave && String(dados.chave).length === 44 ? await NotaFiscal.comChave(dados.chave) : null;
    return dados;
  }

  // ─── Criar / editar ─────────────────────────────────────────────────────
  async store() {
    const u = await this.autorizarEdicao('notas-fiscais');
    const inp = { ...this.body() };
    const pdf = Upload.lista('pdf')[0] ?? null;
    const xml = Upload.lista('xml')[0] ?? null;
    if (!pdf && !xml) throw new HttpException(400, 'Anexe o PDF e/ou o XML da nota');
    // Campos vazios são completados pelo XML (ex.: salvou sem esperar a leitura no navegador).
    if (xml && xml.error === 0) {
      try {
        const lido = NotaFiscalXml.ler(lerArquivo(xml));
        for (const k of ['modelo', 'numero', 'serie', 'chave', 'data_emissao', 'valor', 'emitente_nome', 'emitente_doc', 'destinatario_nome', 'destinatario_doc', 'descricao']) {
          if ((inp[k] ?? '') === '' || (k === 'valor' && !float(inp[k] ?? 0))) inp[k] = lido[k];
        }
        if (empty(inp.tipo)) inp.tipo = await NotaFiscal.sugerirTipo(lido);
      } catch (e) {
        if (e instanceof HttpException) throw new HttpException(400, 'XML: ' + e.message);
        throw e;
      }
    }
    const d = await NotaFiscal.campos(inp, null);
    const txId = await this.txValido(inp.transaction_id ?? null);
    const arqPdf = pdf ? await Upload.salvarPrivado(pdf, PASTA, ['pdf'], MAX_PDF) : null;
    const arqXml = xml ? await Upload.salvarPrivado(xml, PASTA, ['xml'], MAX_XML) : null;
    const id = await NotaFiscal.create({
      ...d,
      pdf_path: arqPdf?.path ?? null, pdf_nome: arqPdf?.nome ?? null,
      xml_path: arqXml?.path ?? null, xml_nome: arqXml?.nome ?? null,
      transaction_id: txId, user_id: u.id,
    });
    await this.log('create', 'notas_fiscais', id, this.rotulo(d) + (txId ? ` — vinculada ao lançamento #${txId}` : ''));
    return this.nota(id);
  }

  async update(id) {
    await this.autorizarEdicao('notas-fiscais');
    id = int(id);
    const atual = await NotaFiscal.findOrFail(id, 'Nota fiscal não encontrada');
    const inp = this.body();
    const d = await NotaFiscal.campos(inp, id);
    const extra = {}; const troca = [];
    for (const [qual, max] of [['pdf', MAX_PDF], ['xml', MAX_XML]]) {
      const f = Upload.lista(qual)[0] ?? null;
      if (!f) continue;
      const arq = await Upload.salvarPrivado(f, PASTA, [qual], max);
      await Upload.apagar(atual[qual + '_path']);
      extra[qual + '_path'] = arq.path; extra[qual + '_nome'] = arq.nome;
      troca.push(qual.toUpperCase() + (atual[qual + '_path'] ? ' substituído' : ' anexado') + `: ${arq.nome}`);
    }
    if (tem(inp, 'transaction_id')) extra.transaction_id = await this.txValido(inp.transaction_id);
    await NotaFiscal.update(id, { ...d, ...extra, updated_at: agora() });
    const diff = diff_log(atual, d, NotaFiscal.ROTULOS);
    await this.log('update', 'notas_fiscais', id, nome_e_mudancas(this.rotulo(d), [diff, ...troca].filter((x) => x).join('; ')));
    return this.nota(id);
  }

  /** Remove só o PDF ou só o XML (a nota precisa ficar com pelo menos um arquivo). */
  async removerArquivo(id, qual) {
    await this.autorizarEdicao('notas-fiscais');
    id = int(id);
    if (!['pdf', 'xml'].includes(qual)) throw new HttpException(400, 'Arquivo inválido');
    const nf = await NotaFiscal.findOrFail(id, 'Nota fiscal não encontrada');
    if (!nf[qual + '_path']) throw new HttpException(400, 'Essa nota não tem ' + qual.toUpperCase());
    const outro = qual === 'pdf' ? 'xml' : 'pdf';
    if (!nf[outro + '_path']) throw new HttpException(400, 'Esse é o único arquivo da nota. Para tirar tudo, apague a nota.');
    await Upload.apagar(nf[qual + '_path']);
    await NotaFiscal.update(id, { [qual + '_path']: null, [qual + '_nome']: null, updated_at: agora() });
    await this.log('update', 'notas_fiscais', id, this.rotulo(nf) + ' — ' + qual.toUpperCase() + ` removido: ${nf[qual + '_nome']}`);
    return this.nota(id);
  }

  async destroy(id) {
    await this.autorizarEdicao('notas-fiscais');
    id = int(id);
    const nf = await NotaFiscal.findOrFail(id, 'Nota fiscal não encontrada');
    await NotaFiscal.delete(id);
    await Upload.apagar(nf.pdf_path);
    await Upload.apagar(nf.xml_path);
    await this.log('delete', 'notas_fiscais', id, this.rotulo(nf), null, nf);
    return { ok: true };
  }

  // ─── Arquivos (entregues só pra quem tem acesso à tela) ────────────────
  async arquivo(id, qual) {
    await this.autorizar('notas-fiscais');
    if (!['pdf', 'xml'].includes(qual)) throw new HttpException(404, 'Arquivo não encontrado');
    const nf = await NotaFiscal.findOrFail(int(id), 'Nota fiscal não encontrada');
    const conteudo = await Upload.lerPrivado(nf[qual + '_path']);
    if (!conteudo) throw new HttpException(404, 'Arquivo não encontrado');
    const nome = String(nf[qual + '_nome'] || `nota-${nf.id}.${qual}`);
    // PDF abre dentro da própria tela (iframe do mesmo site); XML sempre baixa (o navegador não interpreta).
    const inline = qual === 'pdf' && this.query('download') !== '1';
    Arquivo.enviar(conteudo, qual === 'pdf' ? 'application/pdf' : 'application/xml; charset=utf-8', nome,
      { download: !inline, headers: { 'Cache-Control': 'private, no-store', 'X-Frame-Options': 'SAMEORIGIN' } });
  }

  /** Conteúdo do XML + leitura, pra mostrar na tela (texto escapado no navegador). */
  async xml(id) {
    await this.autorizar('notas-fiscais');
    const nf = await NotaFiscal.findOrFail(int(id), 'Nota fiscal não encontrada');
    const bruto = await Upload.lerPrivado(nf.xml_path);
    if (!bruto) throw new HttpException(404, 'Essa nota não tem XML');
    let dados = null; let erro = null;
    try { dados = NotaFiscalXml.ler(bruto); } catch (e) { if (!(e instanceof HttpException)) throw e; erro = e.message; }
    const txt = NotaFiscalXml.decodificar(bruto);
    return { xml: mb_substr(indentar(txt), 0, 400000), dados, erro };
  }

  // ─── Vínculo com lançamento ─────────────────────────────────────────────
  async vincular(id) {
    await this.autorizarEdicao('notas-fiscais');
    id = int(id);
    const nf = await NotaFiscal.findOrFail(id, 'Nota fiscal não encontrada');
    const txId = await this.txValido(this.input('transaction_id'));
    if (txId) {
      const tx = await Transacao.find(txId);
      const esperado = nf.tipo === 'entrada' ? 'expense' : 'income';
      if (tx.tipo !== esperado) throw new HttpException(400, 'Nota de ' + (nf.tipo === 'entrada' ? 'entrada vai com despesa' : 'saída vai com receita') + '. Troque o tipo da nota ou escolha outro lançamento.');
    }
    await NotaFiscal.update(id, { transaction_id: txId, updated_at: agora() });
    await this.log('vincular', 'notas_fiscais', id, this.rotulo(nf) + (txId ? ` → lançamento #${txId}` : ' — vínculo removido'));
    return this.nota(id);
  }

  async candidatos(id) {
    await this.autorizar('notas-fiscais');
    const nf = await NotaFiscal.findOrFail(int(id), 'Nota fiscal não encontrada');
    return NotaFiscal.candidatos(nf, String(this.query('busca', '') ?? '').trim(), this.query('so_aberto') === '1');
  }

  /** Dados pro formulário de lançamento já preenchido com a nota (valor, fornecedor, vencimento das duplicatas…). */
  async sugestaoLancamento(id) {
    await this.autorizar('notas-fiscais');
    const nf = await NotaFiscal.findOrFail(int(id), 'Nota fiscal não encontrada');
    return NotaFiscal.sugerirLancamento(nf, await this.xmlLido(nf));
  }

  async xmlLido(nf) {
    const bruto = await Upload.lerPrivado(nf.xml_path);
    if (!bruto) return null;
    try { return NotaFiscalXml.ler(bruto); } catch (e) { if (e instanceof HttpException) return null; throw e; }
  }

  async txValido(v) {
    if (v === null || v === undefined || v === '' || int(v) === 0) return null;
    if (!(await Transacao.find(int(v)))) throw new HttpException(400, 'Lançamento não encontrado');
    return int(v);
  }

  rotulo(d) {
    const n = ((d.modelo || 'NF') + ' ' + (d.numero || 's/ nº')).trim();
    const quem = d.tipo === 'saida' ? (d.destinatario_nome ?? '') : (d.emitente_nome ?? '');
    return n + (quem ? ` — ${quem}` : '') + ' — R$' + number_format(float(d.valor), 2, '.', '');
  }

  // ─── Importação em lote (vários XML e PDF de uma vez) ───────────────────
  async lote() {
    const u = await this.autorizarEdicao('notas-fiscais');
    const arquivos = Upload.lista('arquivos');
    if (!arquivos.length) throw new HttpException(400, 'Escolha os arquivos XML e/ou PDF');
    if (arquivos.length > MAX_LOTE) throw new HttpException(400, 'Envie no máximo ' + MAX_LOTE + ' arquivos por vez');
    const gerar = this.input('gerar_lancamentos') === '1' && Auth.podeEditar('lancamentos');
    const situacao = ['auto', 'em_aberto', 'quitado'].includes(this.input('situacao')) ? this.input('situacao') : 'auto';

    const xmls = []; const pdfs = []; const res = [];
    for (const f of arquivos) {
      const nome = path.basename(String(f.name).replace(/\\/g, '/'));
      const ext = path.extname(nome).slice(1).toLowerCase();
      if (f.error !== 0) { res.push({ arquivos: [nome], situacao: 'erro', msg: 'Falha no envio (arquivo muito grande?)' }); continue; }
      if (ext === 'xml') {
        try { xmls.push({ f, nome, dados: NotaFiscalXml.ler(lerArquivo(f)) }); } catch (e) {
          if (!(e instanceof HttpException)) throw e;
          res.push({ arquivos: [nome], situacao: 'erro', msg: e.message });
        }
      } else if (ext === 'pdf') {
        pdfs.push({ f, nome, usado: false });
      } else {
        res.push({ arquivos: [nome], situacao: 'erro', msg: 'Só XML e PDF' });
      }
    }

    // Junta o PDF com o XML pela chave (44 dígitos no nome do arquivo) ou pelo número da nota.
    const parDe = (x) => {
      const chave = String(x.dados.chave ?? '');
      const num = String(x.dados.numero ?? '').replace(/^0+/, '');
      const achados = [];
      for (let i = 0; i < pdfs.length; i++) {
        const p = pdfs[i];
        if (p.usado) continue;
        const dig = semExt(p.nome).replace(/\D+/g, ' ');
        if (chave !== '' && dig.replace(/ /g, '').includes(chave)) return i;
        if (num !== '' && dig.trim().split(/\s+/).map((t) => t.replace(/^0+/, '')).includes(num)) achados.push(i);
      }
      return achados.length === 1 ? achados[0] : null;
    };

    for (const x of xmls) {
      const d = x.dados;
      const iPdf = parDe(x);
      if (iPdf !== null) pdfs[iPdf].usado = true;
      const pdf = iPdf !== null ? pdfs[iPdf] : null;
      const nomes = [x.nome, pdf?.nome ?? null].filter((v) => v);
      try {
        const dup = d.chave && String(d.chave).length === 44 ? await Database.one('SELECT * FROM notas_fiscais WHERE chave=?', [d.chave]) : null;
        if (dup) {
          let msg = 'Nota já cadastrada (nº ' + (dup.numero || dup.id) + ')';
          if (pdf && !dup.pdf_path) {
            const a = await Upload.salvarPrivado(pdf.f, PASTA, ['pdf'], MAX_PDF);
            await NotaFiscal.update(int(dup.id), { pdf_path: a.path, pdf_nome: a.nome, updated_at: agora() });
            msg += ' — PDF anexado a ela';
          }
          res.push({ arquivos: nomes, situacao: 'duplicada', msg, nota_id: int(dup.id) });
          continue;
        }
        d.tipo = await NotaFiscal.sugerirTipo(d);
        const campos = await NotaFiscal.campos(d, null);
        const ax = await Upload.salvarPrivado(x.f, PASTA, ['xml'], MAX_XML);
        const ap = pdf ? await Upload.salvarPrivado(pdf.f, PASTA, ['pdf'], MAX_PDF) : null;
        const nfId = await NotaFiscal.create({ ...campos, xml_path: ax.path, xml_nome: ax.nome,
          pdf_path: ap?.path ?? null, pdf_nome: ap?.nome ?? null, user_id: u.id });
        let txId = null;
        if (gerar && campos.valor > 0) {
          const sug = await NotaFiscal.sugerirLancamento({ ...campos, id: nfId }, d);
          if (situacao !== 'auto') sug.status = situacao;
          if (sug.status === 'em_aberto' && !sug.data_vencimento) sug.data_vencimento = sug.data;
          const f = await Transacao.campos(sug);
          f.user_id = u.id;
          txId = await Transacao.create(f);
          await NotaFiscal.update(nfId, { transaction_id: txId });
          await this.log('create', 'transactions', txId, `${f.tipo} - ${f.descricao} - R$${f.valor} (nota fiscal)`);
        }
        await this.log('create', 'notas_fiscais', nfId, this.rotulo(campos) + ' (importação em lote)' + (txId ? ` — lançamento #${txId}` : ''));
        res.push({ arquivos: nomes, situacao: 'ok', msg: this.rotulo(campos) + (txId ? ' · lançamento criado' : ''), nota_id: nfId, transaction_id: txId });
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        res.push({ arquivos: nomes, situacao: 'erro', msg: e.message });
      }
    }
    // PDF sem XML vira nota "só PDF" pra completar à mão.
    for (const p of pdfs) {
      if (p.usado) continue;
      try {
        const ap = await Upload.salvarPrivado(p.f, PASTA, ['pdf'], MAX_PDF);
        const m = semExt(p.nome).match(/(\d{3,9})/);
        const num = m && only_digits(p.nome).length < 44 ? m[1].replace(/^0+/, '') : null;
        const nfId = await NotaFiscal.create({ tipo: 'entrada', numero: num || null, valor: 0, descricao: mb_substr(semExt(p.nome), 0, 255),
          pdf_path: ap.path, pdf_nome: ap.nome, user_id: u.id });
        await this.log('create', 'notas_fiscais', nfId, `PDF sem XML: ${ap.nome} (importação em lote)`);
        res.push({ arquivos: [p.nome], situacao: 'aviso', msg: 'Só PDF — confira tipo, valor e emitente', nota_id: nfId });
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        res.push({ arquivos: [p.nome], situacao: 'erro', msg: e.message });
      }
    }
    const cont = {};
    for (const r of res) cont[r.situacao] = (cont[r.situacao] ?? 0) + 1;
    return { resultado: res, criadas: (cont.ok ?? 0) + (cont.aviso ?? 0), duplicadas: cont.duplicada ?? 0,
      erros: cont.erro ?? 0, lancamentos: res.filter((r) => r.transaction_id).length };
  }
}

module.exports = NotaFiscalController;
