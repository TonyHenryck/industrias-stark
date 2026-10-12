import { esc, brl, opt, badge, fmtDate } from '../format.js';
import { prod, nomeProd } from '../../domain/queries.js';
import { hoje } from '../../domain/util.js';
import { PAGTOS, MOTIVOS } from '../../domain/constants.js';
import { prodOpts, datalist } from '../shared.js';

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
      <label class="wide">Números de série (opcional)<textarea name="seriais" rows="3" placeholder="Um por linha"></textarea></label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar entrada</button></div>
    </form>
  </section>
  <section class="card"><h2>Últimas entradas</h2>${entradasTabela(db)}</section>`;

function vendasTabela(db){
  const list = recentes(db, 'venda', 50);
  if(!list.length) return '<p class="empty">Nenhuma venda registrada.</p>';
  return `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Produto</th><th class="r">Qtd</th><th class="r">Valor</th><th class="r">Lucro</th><th>Cliente</th><th>Pagamento</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(m => `<tr><td>${fmtDate(m.data)}</td><td>${esc(nomeProd(prod(db, m.productId)))}</td><td class="r">${m.qty}</td>
      <td class="r">${brl(m.valor)}</td><td class="r">${brl(m.lucro)}</td><td>${esc(m.cliente||'')}</td><td>${esc(m.pagamento||'')}</td>
      <td>${m.cancelada ? badge('Cancelada','bad') : badge('Ativa','ok')}</td>
      <td>${m.cancelada ? '' : `<button class="btn small" data-act="cancelVenda" data-id="${m.id}">Cancelar</button>`}</td></tr>`).join('')}
    </tbody></table></div>`;
}

export const vendas = ({db}) => `
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
      <label class="wide">Números de série (opcional)<textarea name="seriais" rows="2" placeholder="Um por linha"></textarea></label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar venda</button></div>
    </form>
  </section>
  <section class="card"><h2>Últimas vendas</h2>${vendasTabela(db)}</section>`;

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
