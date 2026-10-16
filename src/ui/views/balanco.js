import { esc, brl, nf, opt, fmtDate } from '../format.js';
import { balanco, conferirCaixa } from '../../domain/reports.js';
import { CATEGORIAS_DESPESA } from '../../domain/constants.js';
import { hoje } from '../../domain/util.js';
import { barras } from '../charts.js';
import { periodoSelect } from '../shared.js';

const linha = (rotulo, valor, {total = false, sinal = '', neg = false, dica = ''} = {}) => `
  <div class="st-row ${total ? 'total' : ''}">
    <span>${sinal ? `<em>${sinal}</em> ` : ''}${rotulo}${dica ? `<small>${dica}</small>` : ''}</span>
    <strong class="${neg ? 'neg' : ''}">${brl(valor)}</strong>
  </div>`;

const MSG = {
  bate: () => ['ok', 'Bateu: o dinheiro que você tem é exatamente o que o sistema espera.'],
  sobra: c => ['warn', `Sobraram ${brl(c.diferenca)} no seu dinheiro em relação ao sistema. Pode faltar lançar uma venda ou um recebimento, ou um valor foi lançado a menos.`],
  falta: c => ['bad', `Faltam ${brl(-c.diferenca)} em relação ao sistema. Pode faltar lançar uma despesa, um pagamento, uma retirada sua, ou um valor foi lançado a mais.`],
};

function conferencia(db, conf){
  let res = '', v = {real: '', inicial: ''};
  if(conf){
    v = conf.campos;
    if(conf.erro) res = `<p class="alert">${esc(conf.erro)}</p>`;
    else {
      const c = conf.resultado, [cls, texto] = MSG[c.situacao](c);
      res = `<div class="st-sep"></div>
        ${linha('Dinheiro que você tinha ao começar', c.inicial)}
        ${linha('Saldo do caixa no sistema (desde o início)', c.sistema, {sinal: '+'})}
        ${linha('Dinheiro esperado', c.esperado, {total: true})}
        ${linha('Dinheiro que você tem hoje', c.real)}
        <p class="${cls === 'ok' ? 'hint' : 'alert'}" style="margin:12px 0 0"><span class="badge ${cls}">${c.situacao === 'bate' ? 'Bateu' : c.situacao === 'sobra' ? 'Sobra' : 'Falta'}</span> ${esc(texto)}</p>`;
    }
  }
  return `<section class="card">
    <h2>Conferir o caixa</h2>
    <p class="hint">Some o dinheiro que você tem de verdade (em mãos, na conta e o que a maquininha ainda vai liberar) e compare com o que o sistema calcula, contando tudo desde o começo. Faça isso de vez em quando para achar lançamentos esquecidos.</p>
    <form data-form="conferencia" class="form">
      <label>Dinheiro que você tem hoje (R$)*<input name="real" type="number" step="0.01" required value="${esc(v.real)}"></label>
      <label>Dinheiro que você já tinha ao começar (R$)<input name="inicial" type="number" step="0.01" placeholder="0" value="${esc(v.inicial)}"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Conferir</button></div>
    </form>
    ${res}
  </section>`;
}

export default ({db, periodo, conferencia: conf}) => {
  const b = balanco(db, periodo);

  const resultado = `<section class="card">
    <h2>Resultado do período</h2>
    <p class="hint">O lucro de verdade: o que sobrou depois de pagar os aparelhos vendidos, as despesas e as perdas.</p>
    ${linha('Vendas', b.receita)}
    ${linha('Custo dos aparelhos vendidos', b.custoVendido, {sinal: '−'})}
    ${linha('Lucro bruto', b.lucroBruto, {total: true, neg: b.lucroBruto < 0})}
    ${linha('Despesas', b.despesas, {sinal: '−'})}
    ${linha('Perdas e baixas', b.perdas, {sinal: '−'})}
    ${linha('Lucro líquido', b.lucroLiquido, {total: true, neg: b.lucroLiquido < 0, dica: `Margem ${nf(b.margemLiquida, 1)}%`})}
  </section>`;

  const caixa = `<section class="card">
    <h2>Caixa do período</h2>
    <p class="hint">O dinheiro que de fato entrou e saiu. Venda a receber só entra quando a parcela é recebida; compra a prazo só sai quando é paga. Comprar aparelhos baixa o caixa, mas não é prejuízo: o dinheiro vira estoque.</p>
    ${linha('Vendas recebidas à vista', b.vendasAVista)}
    ${linha('Parcelas recebidas', b.recebimentos)}
    ${linha('Compras de produto pagas', b.comprasPagas, {sinal: '−'})}
    ${linha('Despesas', b.despesas, {sinal: '−'})}
    ${b.reembolsos ? linha('Dinheiro devolvido a clientes', b.reembolsos, {sinal: '−'}) : ''}
    ${linha('Saldo do caixa', b.saldo, {total: true, neg: b.saldo < 0})}
    <div class="st-sep"></div>
    ${linha('A receber (em aberto)', b.aReceber, {dica: b.vencidoReceber ? `${brl(b.vencidoReceber)} já venceu` : ''})}
    ${linha('A pagar (em aberto)', b.aPagar, {dica: b.vencidoPagar ? `${brl(b.vencidoPagar)} já venceu` : ''})}
    ${linha('Dinheiro parado em estoque', b.dinheiroParado, {dica: 'Custo dos aparelhos que ainda não foram vendidos (hoje).'})}
  </section>`;

  const pag = b.porPagamento.length ? barras(b.porPagamento.map(p => ({
    rotulo: p.forma, sub: `${nf(p.qtd)} venda(s) · ${nf(p.pct, 0)}%`, valor: p.valor, texto: brl(p.valor),
  }))) : '<p class="empty">Nenhuma venda neste período.</p>';

  const cat = b.porCategoria.length ? barras(b.porCategoria.map(c => ({
    rotulo: c.categoria, valor: c.valor, texto: brl(c.valor),
  }))) : '<p class="empty">Nenhum gasto neste período.</p>';

  const lista = b.listaDespesas.length ? `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Categoria</th><th class="r">Valor</th><th>Observações</th><th></th></tr></thead>
    <tbody>${b.listaDespesas.map(d => `<tr><td>${fmtDate(d.data)}</td><td>${esc(d.categoria)}</td><td class="r">${brl(d.valor)}</td>
      <td>${esc(d.obs || '')}</td><td><button class="btn small" data-act="delDespesa" data-id="${d.id}">Excluir</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhuma despesa neste período.</p>';

  return `
  ${periodoSelect(periodo)}
  <div class="cols2">${resultado}${caixa}</div>
  <div class="cols2">
    <section class="card"><h2>Vendas por forma de pagamento</h2>${pag}</section>
    <section class="card"><h2>Gastos por categoria</h2>${cat}</section>
  </div>
  <section class="card">
    <h2>Registrar despesa</h2>
    <p class="hint">Frete, embalagem, anúncios e taxas. A compra de produto não entra aqui: ela já é lançada em Entradas.</p>
    <form data-form="despesa" class="form">
      <label>Categoria*<select name="categoria" required>${CATEGORIAS_DESPESA.map(c => opt(c, c, '')).join('')}</select></label>
      <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
      <label>Valor (R$)*<input name="valor" type="number" step="0.01" min="0.01" required></label>
      <label class="wide">Observações<input name="obs" placeholder="Ex.: Sedex pedido do João"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar despesa</button></div>
    </form>
  </section>
  <section class="card"><h2>Despesas do período</h2>${lista}</section>
  ${conferencia(db, conf)}`;
};
