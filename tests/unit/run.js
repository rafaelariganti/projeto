/**
 * Testes unitários sem framework.
 *   npm test      → sai com código 1 se algum teste falhar (o CI quebra)
 */
process.env.APP_ENV = 'testing';
require('../../src/bootstrap');
const assert = require('assert');
const h = require('../../src/helpers');
const Logger = require('../../src/core/Logger');
const Permissions = require('../../src/core/Permissions');
const EstrategiasDre = require('../../src/services/Dre/EstrategiasDre');
const FabricaLeitorNotaFiscal = require('../../src/services/NotaFiscal/FabricaLeitorNotaFiscal');
const DocumentoXml = require('../../src/services/NotaFiscal/DocumentoXml');
const NotaFiscalXml = require('../../src/services/NotaFiscalXml');
const ImportService = require('../../src/services/ImportService');
const MtRand = require('../../src/database/MtRand');

let ok = 0; const falhas = [];
function teste(nome, fn) {
  try { fn(); ok++; console.log(`  ✔ ${nome}`); } catch (e) { falhas.push(nome); console.log(`  ✘ ${nome} — ${e.message}`); }
}
const igual = (esperado, obtido, msg = '') => assert.deepStrictEqual(obtido, esperado, msg);
const verdade = (v, msg = 'esperado verdadeiro') => { if (!v) throw new Error(msg); };

console.log('Helpers');
teste('only_digits remove máscara', () => igual('11222333000181', h.only_digits('11.222.333/0001-81')));
teste('cnpj_valido aceita CNPJ válido', () => verdade(h.cnpj_valido('11.222.333/0001-81')));
teste('cnpj_valido recusa dígito errado', () => verdade(!h.cnpj_valido('11.222.333/0001-82'), 'aceitou CNPJ inválido'));
teste('cnpj_valido recusa repetidos', () => verdade(!h.cnpj_valido('11111111111111'), 'aceitou 111...'));
teste('cpf_valido', () => verdade(h.cpf_valido('529.982.247-25') && !h.cpf_valido('529.982.247-24')));
teste('brl formata em reais', () => igual('R$ 1.234,50', h.brl(1234.5)));
teste('num trata não numérico como 0', () => igual(0, h.num('abc')));
teste('str_or_null', () => igual(null, h.str_or_null('   ')));
teste('e() escapa HTML (XSS)', () => igual('&lt;script&gt;', h.e('<script>')));
teste('senha_fraca exige 8+ com letra e número', () => {
  verdade(h.senha_fraca('abc') !== null); verdade(h.senha_fraca('abcdefgh') !== null); igual(null, h.senha_fraca('abcdef12'));
});
teste('dias_no_mes considera ano bissexto', () => igual(29, h.dias_no_mes(2, 2028)));
teste('round arredonda como o PHP (1.005 → 1.01)', () => igual(1.01, h.round(1.005, 2)));
teste('num_str imprime número como o PHP', () => igual('44701.85', h.num_str(44701.850000000006)));

console.log('Logger (CloudWatch)');
teste('linha é JSON com level e msg', () => {
  const j = JSON.parse(Logger.linha('ERROR', 'falhou', { x: 1 }));
  igual('ERROR', j.level); igual('falhou', j.msg); igual(1, j.x); verdade(j.ts && j.version);
});
teste('linha nunca expõe senha/token', () => {
  const l = Logger.linha('INFO', 'login', { password: 'segredo123', token: 'abc', usuario: 'ana' });
  verdade(!l.includes('segredo123') && !l.includes('"abc"'), 'vazou dado sensível');
  verdade(l.includes('"usuario":"ana"'));
});

console.log('Permissões');
teste('tela só de consulta não aceita "editar"', () => igual(1, Permissions.normalizar({ dashboard: 2 }).dashboard));
teste('chave desconhecida é descartada', () => verdade(!('xyz' in Permissions.normalizar({ xyz: 2 }))));

console.log('DRE (Strategy)');
teste('regime desconhecido cai no padrão', () => igual(EstrategiasDre.regimes()[0].chave(), EstrategiasDre.regime('xyz').chave()));
teste('regime caixa é encontrado pela chave', () => igual('caixa', EstrategiasDre.regime('caixa').chave()));
teste('agrupamento por grupo/conta', () => igual('Pessoal — Prestadores', EstrategiasDre.agrupamento('grupo').item({ grupo: 'Pessoal', conta_nome: 'Prestadores' })));

console.log('Notas fiscais (Factory)');
const nfe = '<?xml version="1.0"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261111222333000181550010000001231000001234"><ide><mod>55</mod><nNF>123</nNF><dhEmi>2026-11-10T10:00:00-03:00</dhEmi></ide>'
  + '<emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor X LTDA</xNome></emit><det><prod><xProd>Luvas</xProd></prod></det>'
  + '<total><ICMSTot><vNF>150.50</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-12-10</dVenc><vDup>150.50</vDup></dup></cobr></infNFe></NFe></nfeProc>';
teste('fábrica escolhe o leitor de NF-e', () => igual('LeitorNfe', FabricaLeitorNotaFiscal.criar(DocumentoXml.carregar(nfe)).constructor.name));
teste('NF-e: número, valor, chave e duplicata', () => {
  const d = NotaFiscalXml.ler(nfe);
  igual('123', d.numero); igual(150.5, d.valor); igual(44, d.chave.length); igual('2026-12-10', d.duplicatas[0].vencimento);
});
teste('NFS-e ABRASF é reconhecida', () => igual('LeitorNfseAbrasf', FabricaLeitorNotaFiscal.criar(DocumentoXml.carregar('<CompNfse><Nfse><InfNfse><Numero>9</Numero></InfNfse></Nfse></CompNfse>')).constructor.name));
teste('XML com DOCTYPE é recusado (XXE)', () => assert.throws(() => NotaFiscalXml.ler('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><x/>')));

console.log('Importação');
teste('valor "R$ 1.234,56" vira 1234.56', () => igual(1234.56, ImportService.valor('R$ 1.234,56')));
teste('valor "(50,00)" é negativo', () => igual(-50, ImportService.valor('(50,00)')));
teste('data dd/mm/aa', () => igual('2026-02-10', ImportService.data('10/02/26')));
teste('data inválida vira null', () => igual(null, ImportService.data('31/02/2026')));
teste('tipo "Saída" é despesa', () => igual('expense', ImportService.tipo('Saída')));

console.log('Dados fictícios');
teste('mt_rand igual ao do PHP (semente 2026)', () => { const m = new MtRand(2026); igual([6, 4, 99], [m.rand(1, 100), m.rand(0, 9), m.rand(1, 100)]); });

console.log(`\n${ok} ok, ${falhas.length} falha(s)`);
process.exit(falhas.length ? 1 : 0);
