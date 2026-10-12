import { esc, brl, nf, badge } from '../format.js';
import { stock, avgCost, units, nomeProd, situacao } from '../../domain/queries.js';
import { resumo, balanco, serieVendas, topProdutos, estoqueMaisAntigo, topClientes } from '../../domain/reports.js';
import { sum } from '../../domain/util.js';
import { colunas, barras } from '../charts.js';
import { periodoSelect } from '../shared.js';

const kpi = (l, v, s = '', cls = '') => `<div class="kpi"><span>${l}</span><strong class="${cls}">${v}</strong>${s ? `<small>${s}</small>` : ''}</div>`;

function graficoVendas(db, periodo, metrica){
  const {mensal, pontos} = serieVendas(db, periodo);
  const lucro = metrica === 'lucro';
  const nome = `${lucro ? 'Lucro bruto' : 'Receita'} por ${mensal ? 'mês' : 'dia'}`;
  const seg = `<div class="seg" role="group" aria-label="Métrica do gráfico">
      <button type="button" class="${lucro ? '' : 'on'}" data-act="metrica" data-v="receita" aria-pressed="${!lucro}">Receita</button>
      <button type="button" class="${lucro ? 'on' : ''}" data-act="metrica" data-v="lucro" aria-pressed="${lucro}">Lucro</button></div>`;
  const dados = pontos.map(p => ({
    rotulo: p.rotulo, valor: lucro ? p.lucro : p.receita,
    tip: `${p.rotulo}: ${brl(lucro ? p.lucro : p.receita)} · ${p.qtd} un. vendida(s)`,
  }));
  const temVenda = pontos.some(p => p.receita > 0);
  return `<section class="card">
    <div class="card-head"><h2>${nome}</h2>${seg}</div>
    ${temVenda ? colunas({pontos: dados, nome, colunaTabela: lucro ? 'Lucro bruto' : 'Receita'})
               : '<p class="empty">Nenhuma venda neste período.</p>'}
  </section>`;
}

export default ({db, periodo, metrica}) => {
  const b = balanco(db, periodo);
  const {disp, alertas} = resumo(db, periodo);
  const top = topProdutos(db, periodo);
  const antigo = estoqueMaisAntigo(db);
  const clientes = topClientes(db, periodo);
  const ticket = b.vendasQtd ? b.receita / b.vendasQtd : 0;

  const topHtml = top.length ? barras(top.map(t => ({
    rotulo: t.nome, sub: `${nf(t.qtd)} un. · margem ${nf(t.margem, 0)}%`, valor: Math.max(t.lucro, 0), texto: brl(t.lucro),
  }))) : '<p class="empty">Nenhuma venda neste período.</p>';

  const pagHtml = b.porPagamento.length ? barras(b.porPagamento.map(p => ({
    rotulo: p.forma, sub: `${nf(p.qtd)} venda(s) · ${nf(p.pct, 0)}%`, valor: p.valor, texto: brl(p.valor),
  }))) : '<p class="empty">Nenhuma venda neste período.</p>';

  const comEntrada = db.products.filter(p => situacao(db, p)[0] !== '');
  const semEntrada = db.products.length - comEntrada.length;

  return `
  ${periodoSelect(periodo)}
  <div class="kpis">
    ${kpi('Em estoque', `${nf(disp.length)} un.`, `Custo ${brl(b.dinheiroParado)}`)}
    ${kpi('Receita', brl(b.receita), `${nf(b.vendasQtd)} venda(s)`)}
    ${kpi('Lucro líquido', brl(b.lucroLiquido), `Margem ${nf(b.margemLiquida, 1)}%`, b.lucroLiquido < 0 ? 'neg' : '')}
    ${kpi('Despesas e perdas', brl(b.despesas + b.perdas), `Despesas ${brl(b.despesas)} · perdas ${brl(b.perdas)}`)}
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
