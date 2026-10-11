import { esc, brl, nf, opt, badge } from '../format.js';
import { stock, avgCost, units, nomeProd, situacao } from '../../domain/queries.js';
import { resumo } from '../../domain/reports.js';
import { sum } from '../../domain/util.js';

export default ({db, periodo}) => {
  const {vendas, baixas, disp, valorEstoque, receita, lucro, margem, alertas} = resumo(db, periodo);
  const kpi = (l,v,s='') => `<div class="kpi"><span>${l}</span><strong>${v}</strong>${s?`<small>${s}</small>`:''}</div>`;
  return `
  <div class="inline" style="margin-bottom:12px"><label class="inline">Período
    <select id="per">${opt('tudo','Todo o período',periodo)}${opt('mes','Este mês',periodo)}</select></label></div>
  <div class="kpis">
    ${kpi('Em estoque', `${nf(disp.length)} un.`, `Custo ${brl(valorEstoque)}`)}
    ${kpi('Unidades vendidas', `${nf(sum(vendas,'qty'))} un.`, `${vendas.length} venda(s)`)}
    ${kpi('Receita', brl(receita))}
    ${kpi('Lucro', brl(lucro), `Margem ${nf(margem,1)}%`)}
    ${kpi('Perdas e baixas', brl(sum(baixas,'valor')), `${baixas.length} registro(s)`)}
  </div>
  <section class="card">
    <h2>Situação por produto</h2>
    ${alertas.length ? `<p class="alert">Atenção: ${alertas.map(p=>esc(nomeProd(p))).join(', ')}.</p>` : ''}
    ${db.products.length ? `<div class="tbl"><table>
      <thead><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Mínimo</th><th class="r">Custo médio</th><th class="r">Preço padrão</th><th class="r">Valor em estoque</th><th>Situação</th></tr></thead>
      <tbody>${db.products.map(p => {
        const [c,l] = situacao(db, p);
        return `<tr><td>${esc(nomeProd(p))}</td><td class="r">${stock(db, p.id)}</td><td class="r">${p.minimo||0}</td>
          <td class="r">${brl(avgCost(db, p.id))}</td><td class="r">${brl(p.precoPadrao)}</td>
          <td class="r">${brl(sum(units(db, p.id),'custo'))}</td><td>${badge(l,c)}</td></tr>`;}).join('')}
      </tbody></table></div>` : '<p class="empty">Cadastre um produto para começar.</p>'}
  </section>`;
};
