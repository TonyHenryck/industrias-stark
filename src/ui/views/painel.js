import { esc, brl, nf, badge, fmtDate } from '../format.js';
import { stock, avgCost, units, nomeProd, situacao } from '../../domain/queries.js';
import { resumo, balanco, serieVendas, topProdutos, estoqueMaisAntigo, topClientes, contas, garantiasVencendo } from '../../domain/reports.js';
import { sum } from '../../domain/util.js';
import { colunas, barras, linhas, sparkline, rosca } from '../charts.js';
import { periodoSelect } from '../shared.js';

const kpi = (l, v, s = '', cls = '', tom = '', spark = '') => `<div class="kpi ${tom}"><span>${l}</span><strong class="${cls}">${v}</strong>${s ? `<small>${s}</small>` : ''}${spark}</div>`;

function graficoVendas(db, periodo, metrica){
  const {mensal, pontos} = serieVendas(db, periodo);
  const cmp = metrica === 'comparar', lucro = metrica === 'lucro';
  const nome = cmp ? `Receita e lucro por ${mensal ? 'mês' : 'dia'}` : `${lucro ? 'Lucro bruto' : 'Receita'} por ${mensal ? 'mês' : 'dia'}`;
  const op = (v, t) => `<button type="button" class="${metrica === v || (v === 'receita' && !cmp && !lucro) ? 'on' : ''}" data-act="metrica" data-v="${v}" aria-pressed="${metrica === v || (v === 'receita' && !cmp && !lucro)}">${t}</button>`;
  const seg = `<div class="seg" role="group" aria-label="Métrica do gráfico">${op('receita', 'Receita')}${op('lucro', 'Lucro')}${op('comparar', 'Comparar')}</div>`;
  const temVenda = pontos.some(p => p.receita > 0);
  let corpo;
  if(!temVenda) corpo = '<p class="empty">Nenhuma venda neste período.</p>';
  else if(cmp) corpo = linhas({
    nome, rotulos: pontos.map(p => p.rotulo),
    series: [{nome: 'Receita', valores: pontos.map(p => p.receita)}, {nome: 'Lucro bruto', valores: pontos.map(p => p.lucro)}],
    tips: pontos.map(p => `${p.rotulo}: receita ${brl(p.receita)} · lucro ${brl(p.lucro)}`),
  });
  else corpo = colunas({
    nome, colunaTabela: lucro ? 'Lucro bruto' : 'Receita',
    pontos: pontos.map(p => ({rotulo: p.rotulo, valor: lucro ? p.lucro : p.receita,
      tip: `${p.rotulo}: ${brl(lucro ? p.lucro : p.receita)} · ${p.qtd} un. vendida(s)`})),
  });
  return `<section class="card"><div class="card-head"><h2>${nome}</h2>${seg}</div>${corpo}</section>`;
}

export default ({db, periodo, metrica}) => {
  const b = balanco(db, periodo);
  const {disp, alertas} = resumo(db, periodo);
  const top = topProdutos(db, periodo);
  const antigo = estoqueMaisAntigo(db);
  const clientes = topClientes(db, periodo);
  const ct = contas(db);
  const gv = garantiasVencendo(db);
  const serie = serieVendas(db, periodo).pontos;
  const ticket = b.vendasQtd ? b.receita / b.vendasQtd : 0;

  const topHtml = top.length ? barras(top.map(t => ({
    rotulo: t.nome, sub: `${nf(t.qtd)} un. · margem ${nf(t.margem, 0)}%`, valor: Math.max(t.lucro, 0), texto: brl(t.lucro),
  }))) : '<p class="empty">Nenhuma venda neste período.</p>';

  const pagHtml = b.porPagamento.length ? rosca(b.porPagamento.slice(0, 3).map(p => ({
    rotulo: p.forma, sub: `${nf(p.qtd)} venda(s) · ${nf(p.pct, 0)}%`, valor: p.valor, texto: brl(p.valor),
  })), {rotulo: 'Receita', texto: brl(b.receita)}) : '<p class="empty">Nenhuma venda neste período.</p>';

  const comEntrada = db.products.filter(p => situacao(db, p)[0] !== '');
  const semEntrada = db.products.length - comEntrada.length;

  return `
  ${ct.qtdVencidas ? `<section class="card aviso">
    <p><strong>${ct.qtdVencidas} conta(s) vencida(s)</strong>${ct.vencidoReceber ? ` · a receber ${brl(ct.vencidoReceber)}` : ''}${ct.vencidoPagar ? ` · a pagar ${brl(ct.vencidoPagar)}` : ''}</p>
    <button class="btn small" data-act="go" data-v="contas">Ver contas</button></section>` : ''}
  ${gv.length ? `<section class="card aviso">
    <p><strong>Garantia do fornecedor acabando em até 15 dias:</strong>
      ${gv.slice(0, 3).map(g => `${esc(g.nome)} (${g.qtd} un., até ${fmtDate(g.ate)})`).join(' · ')}${gv.length > 3 ? ` e mais ${gv.length - 3} modelo(s)` : ''}${gv.some(g => g.estimada) ? ' · prazo estimado em 90 dias da entrada' : ''}.</p>
    <small class="sub">Teste os aparelhos e devolva os defeituosos antes do prazo.</small></section>` : ''}
  ${periodoSelect(periodo)}
  <div class="kpis">
    ${kpi('Em estoque', `${nf(disp.length)} un.`, `Custo ${brl(b.dinheiroParado)}`, '', 'azul')}
    ${kpi('Receita', brl(b.receita), `${nf(b.vendasQtd)} venda(s)`, '', 'roxo', sparkline(serie.map(p => p.receita)))}
    ${kpi('Lucro líquido', brl(b.lucroLiquido), `Margem ${nf(b.margemLiquida, 1)}%`, b.lucroLiquido < 0 ? 'neg' : '', 'verde', sparkline(serie.map(p => p.lucro)))}
    ${kpi('Despesas e perdas', brl(b.despesas + b.perdas), `Despesas ${brl(b.despesas)} · perdas ${brl(b.perdas)}`, '', 'rosa')}
    ${kpi('Ticket médio', brl(ticket), 'por venda')}
  </div>
  ${graficoVendas(db, periodo, metrica)}
  <div class="cols2">
    <section class="card"><h2>Produtos que mais deram lucro</h2>${topHtml}</section>
    <section class="card"><h2>Vendas por forma de pagamento</h2>${pagHtml}</section>
  </div>
  <div class="cols2">
  <section class="card">
    <h2>Estoque parado há mais tempo</h2>
    ${antigo.length ? `<div class="tbl"><table>
      <thead><tr><th>Produto</th><th class="r">Unidades</th><th class="r">Dias desde a entrada</th></tr></thead>
      <tbody>${antigo.map(a => `<tr><td>${esc(a.nome)}</td><td class="r">${a.qtd}</td><td class="r">${a.dias}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty">Nenhum produto com estoque.</p>'}
  </section>
  <section class="card">
    <h2>Quem mais comprou</h2>
    ${clientes.length ? barras(clientes.map(c => ({rotulo: c.nome, sub: `${nf(c.compras)} compra(s)`, valor: c.total, texto: brl(c.total)})))
      : '<p class="empty">Informe o cliente ao registrar uma venda para ver o ranking aqui.</p>'}
  </section>
  </div>
  <section class="card">
    <h2>Situação por produto</h2>
    ${alertas.length ? `<p class="alert">Atenção: ${alertas.map(p => esc(nomeProd(p))).join(', ')}.</p>` : ''}
    ${comEntrada.length ? `<div class="tbl"><table>
      <thead><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th><th class="r">Custo médio</th><th class="r">Preço padrão</th><th class="r">Valor em estoque</th><th>Situação</th></tr></thead>
      <tbody>${comEntrada.map(p => {
        const [c, l] = situacao(db, p);
        return `<tr><td>${esc(nomeProd(p))}</td><td class="r">${stock(db, p.id)}</td><td class="r">${p.minimo||0}</td>
          <td class="r">${brl(avgCost(db, p.id))}</td><td class="r">${brl(p.precoPadrao)}</td>
          <td class="r">${brl(sum(units(db, p.id),'custo'))}</td><td>${badge(l,c)}</td></tr>`;}).join('')}
      </tbody></table></div>`
      : `<p class="empty">${db.products.length ? 'Nenhum produto recebeu entrada ainda. Registre uma entrada para ver o estoque aqui.' : 'Cadastre um produto para começar.'}</p>`}
    ${semEntrada && comEntrada.length ? `<p class="hint" style="margin:12px 0 0">${semEntrada} produto(s) cadastrado(s) ainda sem entrada.</p>` : ''}
  </section>`;
};
