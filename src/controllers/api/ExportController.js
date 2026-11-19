/** Exportações: Excel, CSV, XML, PDF e o demonstrativo do DRE. */
const Controller = require('../../core/Controller');
const Database = require('../../core/Database');
const Response = require('../../core/Response');
const EstrategiasDre = require('../../services/Dre/EstrategiasDre');
const DreService = require('../../services/DreService');
const PdfWriter = require('../../services/Spreadsheet/PdfWriter');
const XlsxWriter = require('../../services/Spreadsheet/XlsxWriter');
const Csv = require('../../services/Spreadsheet/Csv');
const { MESES_LONGOS, MESES_CURTOS, ano_param, mes_de, brl, number_format, num_str, round, float, int, date, mb_substr } = require('../../helpers');

const R = XlsxWriter.dinheiro;
const CAB_LANC = ['ID', 'Data', 'Tipo', 'Categoria', 'Centro de Custo', 'Grupo', 'Conta', 'Forma Pagamento', 'Caixa/Banco', 'Cliente/Fornecedor', 'Descrição', 'Valor Bruto', 'Taxa MDR', 'Valor Líquido', 'Status', 'Vencimento', 'Data de pagamento'];
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const s = (v) => String(v ?? '');

function linha(t) {
  return [int(t.id), s(t.data).slice(0, 10), t.tipo === 'income' ? 'Receita' : 'Despesa', s(t.categoria_nome),
    s(t.centro_custo_nome), s(t.grupo), s(t.conta_nome), s(t.forma_pagamento_nome), s(t.caixa_nome),
    s(t.cliente_fornecedor), s(t.descricao), R(float(t.valor)), R(float(t.taxa_mdr)),
    R(float(t.valor_liquido ?? t.valor)), t.status === 'em_aberto' ? 'Em aberto' : 'Quitado',
    t.data_vencimento ? s(t.data_vencimento).slice(0, 10) : '', t.data_pagamento ? s(t.data_pagamento).slice(0, 10) : ''];
}

const escXml = (v) => s(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

class ExportController extends Controller {
  /** Liberado pra quem vê Importar/Exportar e pras telas com botão de download próprio. */
  async permitir() { await this.autorizar('importacao', 'dashboard', 'dre'); }

  async excel() {
    await this.permitir();
    const y = ano_param();
    const txs = await Database.all('SELECT * FROM transactions WHERE YEAR(data)=? ORDER BY data, id', [y]);
    const trs = await Database.all('SELECT * FROM transfers WHERE YEAR(data)=? ORDER BY data, id', [y]);
    const x = new XlsxWriter();
    x.addSheet('Lançamentos', [CAB_LANC, ...txs.map(linha)]);

    const dre = [['Mês', 'Receita Bruta', 'Taxas/Deduções', 'Receita Líquida', 'Despesas', 'Lucro']];
    MESES_LONGOS.forEach((nome, i) => {
      let rb = 0; let ded = 0; let de = 0;
      for (const t of txs) {
        if (mes_de(t.data) !== i + 1) continue;
        if (t.tipo === 'income') { rb += float(t.valor); ded += float(t.taxa_mdr); } else de += float(t.valor);
      }
      dre.push([nome, R(rb), R(ded), R(rb - ded), R(de), R(rb - ded - de)]);
    });
    x.addSheet('DRE Resumo', dre);

    const cats = [['Categoria', 'Tipo', 'Qtd. Lançamentos', 'Total']];
    const agg = new Map();
    for (const t of txs) {
      const k = (t.categoria_nome || 'Sem categoria') + '|' + t.tipo;
      if (!agg.has(k)) agg.set(k, [0, 0]);
      const a = agg.get(k); a[0]++; a[1] += float(t.valor);
    }
    for (const [k, [qtd, tot]] of agg) { const i = k.lastIndexOf('|'); cats.push([k.slice(0, i), k.slice(i + 1) === 'income' ? 'Receita' : 'Despesa', qtd, R(tot)]); }
    x.addSheet('Por Categoria', cats);
    x.addSheet('Transferências', [['ID', 'Data', 'Origem', 'Destino', 'Valor', 'Observações'],
      ...trs.map((t) => [int(t.id), s(t.data).slice(0, 10), s(t.origem_nome), s(t.destino_nome), R(float(t.valor)), s(t.observacoes)])]);
    await this.log('export', 'export', null, `Excel ${y}`);
    Response.download(x.output(), XLSX_MIME, `DRE_${y}.xlsx`);
  }

  async csv() {
    await this.permitir();
    const y = ano_param();
    const linhas = [CAB_LANC];
    for (const t of await Database.all('SELECT * FROM transactions WHERE YEAR(data)=? ORDER BY data, id', [y])) {
      const l = linha(t);
      for (const i of [11, 12, 13]) l[i] = number_format(l[i].v, 2, ',', ''); // Excel BR abre certo
      linhas.push(l);
    }
    await this.log('export', 'export', null, `CSV ${y}`);
    Response.download(Csv.gerar(linhas), 'text/csv; charset=utf-8', `DRE_${y}.csv`);
  }

  async xml() {
    await this.permitir();
    const y = ano_param();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<DRE ano="${y}">\n`;
    for (const t of await Database.all('SELECT * FROM transactions WHERE YEAR(data)=? ORDER BY data, id', [y])) {
      xml += `  <Lancamento><ID>${int(t.id)}</ID><Data>${s(t.data).slice(0, 10)}</Data><Tipo>${t.tipo === 'income' ? 'Receita' : 'Despesa'}</Tipo>`
        + `<Descricao>${escXml(t.descricao)}</Descricao><Categoria>${escXml(t.categoria_nome)}</Categoria><CentroCusto>${escXml(t.centro_custo_nome)}</CentroCusto>`
        + `<Valor>${float(t.valor).toFixed(2)}</Valor><TaxaMDR>${float(t.taxa_mdr).toFixed(2)}</TaxaMDR><ValorLiquido>${float(t.valor_liquido ?? t.valor).toFixed(2)}</ValorLiquido>`
        + `<Status>${escXml(t.status)}</Status></Lancamento>\n`;
    }
    await this.log('export', 'export', null, `XML ${y}`);
    Response.download(xml + '</DRE>', 'application/xml; charset=utf-8', `DRE_${y}.xml`);
  }

  /** PDF do DRE (resumo anual + mês a mês). */
  async pdf() {
    await this.permitir();
    const y = ano_param();
    const dem = await DreService.demonstrativo(y, String(this.query('agrupar', 'categoria')), String(this.query('regime', 'competencia')));
    const p = new PdfWriter(); p.addPage();
    p.font(true, 17); p.textCenter(46, 'DRE — Demonstrativo do Resultado do Exercício');
    p.font(false, 10);
    p.textCenter(70, `Exercício ${y}  ·  Regime: ` + (dem.regime === 'caixa' ? 'caixa' : 'competência') + '  ·  Agrupado por: ' + EstrategiasDre.agrupamento(dem.agrupar).rotulo().toLowerCase(), '#666666');
    p.line(50, 90, 545, 90);
    let yy = 104;
    p.font(true, 8.5);
    p.text(55, yy, 'Conta', '#666666');
    p.textRight(390, yy, `Total ${y}`, '#666666');
    p.textRight(440, yy, 'AV %', '#666666');
    if (dem.tem_anterior) { p.textRight(500, yy, 'Ano anterior', '#666666'); p.textRight(545, yy, 'AH %', '#666666'); }
    yy += 16;
    const pct = (v) => (v === null ? '—' : number_format(v * 100, 1, ',', '.') + '%');
    for (const l of dem.linhas) {
      if (yy > PdfWriter.H - 70) { p.addPage(); yy = 50; }
      const item = l.tipo === 'item';
      const destaque = ['subtotal', 'resultado'].includes(l.tipo);
      if (destaque) p.rect(50, yy - 4, 495, 18, l.tipo === 'resultado' ? (l.total < 0 ? '#fdecea' : '#eef7f1') : '#f3f4f8');
      p.font(!item, item ? 9 : 9.5);
      const cor = l.tipo === 'resultado' ? (l.total < 0 ? '#c0392b' : '#1f8a5b') : (item ? '#333333' : '#1a1a1a');
      const label = Array.from(l.label).length > 48 ? mb_substr(l.label, 0, 46) + '…' : l.label;
      p.text(item ? 68 : 55, yy, label, cor);
      p.textRight(390, yy, brl(l.total), cor);
      p.textRight(440, yy, pct(l.av), '#666666');
      if (dem.tem_anterior) { p.textRight(500, yy, brl(float(l.anterior)), '#666666'); p.textRight(545, yy, pct(l.ah), '#666666'); }
      yy += item ? 15 : 18;
    }
    yy += 4;
    p.font(true, 9.5); p.text(55, yy, 'Margem líquida'); p.textRight(390, yy, pct(dem.margem.total));

    // Mês a mês (receita líquida, despesas, resultado)
    yy += 30;
    if (yy > PdfWriter.H - 300) { p.addPage(); yy = 50; }
    p.font(true, 12); p.text(55, yy, 'Mês a mês'); yy += 22;
    let liq = null; let desp = null; let res = null;
    for (const l of dem.linhas) {
      if (l.tipo === 'subtotal') liq = l.valores;
      if (l.tipo === 'grupo' && l.label === '(−) Despesas') desp = l.valores;
      if (l.tipo === 'resultado') res = l.valores;
    }
    const cols = [55, 230, 335, 440, 545];
    p.font(true, 8.5);
    p.text(cols[0], yy, 'Mês', '#666666');
    ['Receita líquida', 'Despesas', 'Resultado', 'Margem'].forEach((h, i) => p.textRight(cols[i + 1], yy, h, '#666666'));
    yy += 15;
    MESES_LONGOS.forEach((nome, i) => {
      const cor = res[i] >= 0 ? '#1f8a5b' : '#c0392b';
      if (i % 2 === 0) p.rect(50, yy - 4, 495, 16, '#f7f8fa');
      p.font(false, 9);
      p.text(cols[0], yy, nome);
      p.textRight(cols[1], yy, brl(liq[i]));
      p.textRight(cols[2], yy, brl(desp[i]));
      p.textRight(cols[3], yy, brl(res[i]), cor);
      p.textRight(cols[4], yy, pct(dem.margem.valores[i]), cor);
      yy += 16;
    });
    p.font(false, 8); p.textCenter(PdfWriter.H - 40, 'Gerado em ' + date('d/m/Y H:i'), '#aaaaaa');
    await this.log('export', 'export', null, `PDF DRE ${y}`);
    Response.download(p.output(), 'application/pdf', `DRE_${y}.pdf`);
  }

  /** Excel do demonstrativo da tela DRE (mês a mês + total + AV% + ano anterior). */
  async dreExcel() {
    await this.autorizar('dre');
    const y = ano_param();
    const dem = await DreService.demonstrativo(y, String(this.query('agrupar', 'categoria')), String(this.query('regime', 'competencia')));
    const cab = ['Conta', ...MESES_CURTOS, `Total ${y}`, 'AV %'];
    if (dem.tem_anterior) { cab.push('Total ' + (y - 1)); cab.push('AH %'); }
    const rows = [cab];
    const pc = (v) => num_str(round(v * 100, 2)) + '%';
    for (const l of dem.linhas) {
      const r = [(l.tipo === 'item' ? '    ' : '') + l.label, ...l.valores.map((v) => R(float(v))), R(float(l.total)), l.av !== null ? pc(l.av) : ''];
      if (dem.tem_anterior) { r.push(R(float(l.anterior))); r.push(l.ah !== null ? pc(l.ah) : ''); }
      rows.push(r);
    }
    rows.push(['Margem líquida', ...dem.margem.valores.map((v) => (v === null ? '' : pc(v))), dem.margem.total === null ? '' : pc(dem.margem.total)]);
    const x = new XlsxWriter();
    x.addSheet(`DRE ${y}`, rows);
    await this.log('export', 'export', null, `Excel DRE ${y}`);
    Response.download(x.output(), XLSX_MIME, `DRE_demonstrativo_${y}.xlsx`);
  }
}

module.exports = ExportController;
