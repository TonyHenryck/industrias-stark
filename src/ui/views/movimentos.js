import { esc, brl, opt, badge, fmtDate } from '../format.js';
import { prod, nomeProd } from '../../domain/queries.js';
import { hoje, somaMeses } from '../../domain/util.js';
import { PAGTOS, MOTIVOS } from '../../domain/constants.js';
import { prodOpts, datalist, badgeGarantia } from '../shared.js';
import { garantiaDaVenda } from '../../domain/garantia.js';
import { consultarGarantia } from '../../domain/reports.js';

const recentes = (db, tipo, n) => db.moves.filter(m => m.tipo===tipo).sort((a,b)=>b.ts-a.ts).slice(0, n);

function entradasTabela(db){
  const list = recentes(db, 'entrada', 50);
  if(!list.length) return '<p class="empty">Nenhuma entrada registrada.</p>';
  return `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Produto</th><th class="r">Qtd</th><th class="r">Custo unit.</th><th class="r">Total</th><th>Fornecedor</th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${fmtDate(m.data)}</td><td>${esc(nomeProd(prod(db, m.productId)))}</td><td class="r">${m.qty}</td>
      <td class="r">${brl(m.custoUnit)}</td><td class="r">${brl(m.valor)}</td><td>${esc(m.fornecedor||'')}</td></tr>`).join('')}
    </tbody></table></div>`;
}

export const entradas = ({db}) => `
  <section class="card">
    <h2>Registrar entrada</h2>
    <p class="hint">Use para compras e reposições. Se informar números de série, a quantidade será o número de séries, uma por linha.</p>
    <form data-form="entrada" class="form">
      <label>Produto*<select name="produto" required><option value="">Escolha…</option>${prodOpts(db, '')}</select></label>
      <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
      <label>Quantidade<input name="qtd" type="number" min="1" value="1"></label>
      <label>Custo unitário (R$)<input name="custo" type="number" step="0.01" min="0" placeholder="Padrão do produto"></label>
      <label>Fornecedor<input name="fornecedor" list="listaFornecedores" autocomplete="off">${datalist('listaFornecedores', db.suppliers)}</label>
      <label>Garantia do fornecedor (dias)<input name="garantiaForn" type="number" min="0" max="3650" value="90" title="0 = o fornecedor não dá garantia"></label>
      <label>Pagamento da compra<select name="condicao" data-toggle="rec-extra" data-valor="pagar">${opt('pago','Pago agora','pago')}${opt('pagar','A pagar (a prazo)','pago')}</select></label>
      <label class="rec-extra" hidden>Primeiro vencimento*<input name="vencimento" type="date" value="${somaMeses(hoje(), 1)}"></label>
      <label class="rec-extra" hidden>Parcelas<input name="parcelas" type="number" min="1" max="12" value="1"></label>
      <label class="wide">Números de série (opcional)<textarea name="seriais" rows="3" placeholder="Um por linha"></textarea></label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar entrada</button></div>
    </form>
  </section>
  <section class="card"><h2>Últimas entradas</h2>${entradasTabela(db)}</section>`;

function formDevolucao(db, m){
  const unidades = db.units.filter(u => u.saidaId === m.id && u.status === 'vendido');
  return `<tr class="linha-form"><td colspan="10">
    <form data-form="devolucao" class="form">
      <input type="hidden" name="venda" value="${m.id}">
      <label>Quantidade devolvida*<input name="qtd" type="number" min="1" max="${m.qty}" value="1" required></label>
      <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
      <label>Para onde vai o aparelho<select name="destino">${opt('estoque', 'Volta ao estoque (está bom)', 'estoque')}${opt('defeito', 'Baixa por defeito', 'estoque')}</select></label>
      <label>Dinheiro devolvido (R$)<input name="reembolso" type="number" step="0.01" min="0" placeholder="Tudo: ${brl(m.precoUnit)} por unidade"></label>
      <label>Trocar por outro produto?<select name="troca" data-toggle="troca-extra" data-valor="sim">${opt('nao', 'Não, só devolver', 'nao')}${opt('sim', 'Sim, registrar a troca', 'nao')}</select></label>
      <label class="troca-extra" hidden>Novo produto*<select name="trocaProduto"><option value="">Escolha…</option>${prodOpts(db, '', true)}</select></label>
      <label class="troca-extra" hidden>Quantidade<input name="trocaQtd" type="number" min="1" value="1"></label>
      <label class="troca-extra" hidden>Preço unitário (R$)*<input name="trocaPreco" type="number" step="0.01" min="0"></label>
      <label class="troca-extra" hidden>Forma de pagamento<select name="pagamento">${PAGTOS.map(p => opt(p, p, m.pagamento)).join('')}</select></label>
      <label class="wide">Números de série devolvidos (opcional)<textarea name="seriais" rows="2" placeholder="Um por linha. Séries desta venda: ${esc(unidades.map(u => u.serial).filter(Boolean).join(', ') || 'nenhuma')}"></textarea></label>
      <label class="wide">Motivo ou observações<input name="obs" placeholder="Ex.: cliente desistiu, tela com defeito"></label>
      <p class="hint wide" style="margin:0">Na troca, o valor devolvido vira crédito: deixe o padrão (tudo) e lance o preço cheio do novo aparelho. O caixa soma só a diferença.</p>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar</button><button class="btn" type="button" data-act="devolverV" data-id="${m.id}">Fechar</button></div>
    </form></td></tr>`;
}

function vendasTabela(db, devolver){
  const list = recentes(db, 'venda', 50);
  if(!list.length) return '<p class="empty">Nenhuma venda registrada.</p>';
  const status = m => m.cancelada ? badge('Cancelada','bad') : m.qty === 0 ? badge('Devolvida','warn') : badge('Ativa','ok');
  const acoes = m => m.cancelada ? '' : `<div class="acts">
      ${m.qty > 0 ? `<button class="btn small" data-act="devolverV" data-id="${m.id}" aria-expanded="${devolver === m.id}">Devolver ou trocar</button>` : ''}
      ${m.devolvido ? '' : `<button class="btn small" data-act="cancelVenda" data-id="${m.id}">Cancelar</button>`}</div>`;
  return `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Produto</th><th class="r">Qtd</th><th class="r">Valor</th><th class="r">Lucro</th><th>Cliente</th><th>Pagamento</th><th>Garantia</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${fmtDate(m.data)}</td><td>${esc(nomeProd(prod(db, m.productId)))}</td>
      <td class="r">${m.qty}${m.devolvido ? `<small class="sub" style="display:block">${m.devolvido.qty} devolvida(s)</small>` : ''}</td>
      <td class="r">${brl(m.valor)}</td><td class="r">${brl(m.lucro)}</td><td>${esc(m.cliente||'')}</td><td>${esc(m.pagamento||'')}</td><td>${m.cancelada || m.qty === 0 ? '' : badgeGarantia(garantiaDaVenda(m))}</td>
      <td>${status(m)}</td><td>${acoes(m)}</td></tr>${devolver === m.id && !m.cancelada && m.qty > 0 ? formDevolucao(db, m) : ''}`).join('')}
    </tbody></table></div>`;
}

export function garantiaRows({db, fGarantia}){
  const q = fGarantia.q.trim();
  if(q.length < 2) return '<p class="empty">Digite pelo menos 2 caracteres.</p>';
  const lista = consultarGarantia(db, q);
  if(!lista.length) return '<p class="empty">Nenhuma venda encontrada com esse número de série, nome ou telefone.</p>';
  return `<div class="tbl"><table>
    <thead><tr><th>Venda</th><th>Cliente</th><th>Produto</th><th>Série</th><th>Garantia</th></tr></thead>
    <tbody>${lista.map(r => `<tr><td>${fmtDate(r.data)}</td><td>${esc(r.cliente || '')}</td><td>${esc(r.produto)}</td>
      <td class="mono">${esc(r.serials.join(', ') || 'sem série')}</td><td>${badgeGarantia(r.garantia)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

export const vendas = s => { const {db, fGarantia, devolver} = s; return `
  <section class="card">
    <h2>Registrar venda</h2>
    <p class="hint">Se informar números de série, a quantidade será o número de séries. Caso contrário, saem as unidades mais antigas.</p>
    <form data-form="venda" class="form">
      <label>Produto*<select name="produto" required><option value="">Escolha…</option>${prodOpts(db, '', true)}</select></label>
      <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
      <label>Quantidade<input name="qtd" type="number" min="1" value="1"></label>
      <label>Preço unitário (R$)*<input name="preco" type="number" step="0.01" min="0" required></label>
      <label>Cliente<input name="cliente" list="listaClientes" autocomplete="off">${datalist('listaClientes', db.customers)}</label>
      <label>Forma de pagamento<select name="pagamento">${PAGTOS.map(p=>opt(p,p,'')).join('')}</select></label>
      <label>Garantia ao cliente (dias)<input name="garantia" type="number" min="0" max="3650" value="90" title="0 = sem garantia"></label>
      <label>Recebimento<select name="recebimento" data-toggle="rec-extra" data-valor="receber">${opt('avista','À vista (já recebi)','avista')}${opt('receber','A receber (fiado ou parcelado)','avista')}</select></label>
      <label class="rec-extra" hidden>Primeiro vencimento*<input name="vencimento" type="date" value="${somaMeses(hoje(), 1)}"></label>
      <label class="rec-extra" hidden>Parcelas<input name="parcelas" type="number" min="1" max="12" value="1"></label>
      <label class="wide">Números de série (opcional)<textarea name="seriais" rows="2" placeholder="Um por linha"></textarea></label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar venda</button></div>
    </form>
  </section>
  <section class="card">
    <h2>Consultar garantia</h2>
    <p class="hint">Quando um cliente reclamar: digite o número de série, o nome ou o telefone dele e veja se ainda está na garantia.</p>
    <div class="filters"><input data-f="g" data-k="q" type="search" placeholder="Série, nome ou telefone" value="${esc(fGarantia.q)}" autocomplete="off"></div>
    <div id="gTbl">${garantiaRows(s)}</div>
  </section>
  <section class="card"><h2>Últimas vendas</h2>${vendasTabela(db, devolver)}</section>`; };

export const baixas = ({db}) => {
  const list = db.moves.filter(m => m.tipo==='baixa').sort((a,b)=>b.ts-a.ts);
  const tabela = list.length ? `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Produto</th><th class="r">Qtd</th><th class="r">Custo perdido</th><th>Motivo</th><th>Observações</th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${fmtDate(m.data)}</td><td>${esc(nomeProd(prod(db, m.productId)))}</td><td class="r">${m.qty}</td>
      <td class="r">${brl(m.valor)}</td><td>${esc(m.motivo||'')}</td><td>${esc(m.obs||'')}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhuma baixa registrada.</p>';
  return `
  <section class="card">
    <h2>Registrar baixa</h2>
    <p class="hint">Para aparelhos que saíram do estoque sem venda, como defeitos ou perdas. O custo entra como prejuízo.</p>
    <form data-form="baixa" class="form">
      <label>Produto*<select name="produto" required><option value="">Escolha…</option>${prodOpts(db, '', true)}</select></label>
      <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
      <label>Quantidade<input name="qtd" type="number" min="1" value="1"></label>
      <label>Motivo<select name="motivo">${MOTIVOS.map(m=>opt(m,m,'')).join('')}</select></label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar baixa</button></div>
    </form>
  </section>
  <section class="card"><h2>Baixas</h2>${tabela}</section>`;
};
