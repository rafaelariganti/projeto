/**
 * XML da nota já carregado com segurança + atalhos de busca pelo nome local da tag
 * (cada prefeitura usa um namespace, então o namespace é ignorado).
 * Segurança: XML com DOCTYPE é recusado (evita XXE / "billion laughs") e nada é baixado da rede.
 */
const { DOMParser } = require('@xmldom/xmldom');
const { HttpException } = require('../../core/HttpException');

const ELEMENTO = 1;
const nomeLocal = (n) => n.localName || String(n.nodeName || '').replace(/^.*:/, '');
const filhos = (n) => { const out = []; for (let c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === ELEMENTO) out.push(c); return out; };

/** Buffer/texto → string (UTF-8 válido; senão ISO-8859-1). */
function decodificar(xml) {
  if (typeof xml === 'string') return xml;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(xml); } catch { return Buffer.from(xml).toString('latin1'); }
}

class DocumentoXml {
  constructor(dom) { this.dom = dom; }

  static carregar(xml) {
    let txt = decodificar(xml).replace(/^[﻿\s]+/, '');
    if (txt === '') throw new HttpException(400, 'XML vazio');
    if (/<!DOCTYPE/i.test(txt) || /<!ENTITY/i.test(txt)) throw new HttpException(400, 'XML com DOCTYPE não é aceito');
    let falhou = false;
    let dom = null;
    try {
      dom = new DOMParser({
        onError: (nivel) => { if (nivel === 'error' || nivel === 'fatalError') falhou = true; },
      }).parseFromString(txt, 'text/xml');
    } catch { falhou = true; }
    if (falhou || !dom || !dom.documentElement || nomeLocal(dom.documentElement) === 'parsererror') {
      throw new HttpException(400, 'Não foi possível ler o XML (arquivo corrompido ou não é XML)');
    }
    return new DocumentoXml(dom);
  }

  /** Elemento raiz do XML. */
  raiz() { return this.dom.documentElement; }

  /** Todos os descendentes (em ordem do documento) com esse nome local. */
  descendentes(ctx, nome) {
    const out = [];
    const visitar = (n) => { for (const c of filhos(n)) { if (nomeLocal(c) === nome) out.push(c); visitar(c); } };
    visitar(ctx);
    return out;
  }

  /** "a/b/c" → .//a/b/c ignorando namespace (equivale ao XPath com local-name()). */
  nos(p, ctx = null) {
    const partes = String(p).split('/');
    let atuais = this.descendentes(ctx ?? this.dom, partes[0]);
    for (const nome of partes.slice(1)) {
      const prox = [];
      for (const n of atuais) for (const c of filhos(n)) if (nomeLocal(c) === nome) prox.push(c);
      atuais = prox;
    }
    return atuais;
  }

  no(p, ctx = null) { return this.nos(p, ctx)[0] ?? null; }

  /** Primeiro texto não vazio entre vários caminhos. */
  txt(caminhos, ctx = null) {
    for (const c of caminhos) {
      const n = this.no(c, ctx);
      if (n && String(n.textContent).trim() !== '') return String(n.textContent).replace(/\s+/gu, ' ').trim();
    }
    return null;
  }

  /** Tem alguma destas tags? (usado pela fábrica pra reconhecer o tipo da nota) */
  temAlguma(...tags) {
    return tags.some((t) => this.no(t) !== null);
  }

  static atributo(n, nome) { return n && n.getAttribute ? (n.getAttribute(nome) || '') : ''; }
}

DocumentoXml.decodificar = decodificar;

module.exports = DocumentoXml;
