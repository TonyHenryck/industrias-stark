import { esc, brl, nf, fmtDate } from '../format.js';
import { resumoClientes, comprasDoCliente } from '../../domain/reports.js';
import { prod, nomeProd, norm } from '../../domain/queries.js';

/** Link do WhatsApp quando o telefone tem DDD + número. */
const zap = tel => {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : '';
};
const telefone = tel => !tel ? '' : zap(tel)
  ? `<a href="${zap(tel)}" target="_blank" rel="noopener noreferrer">${esc(tel)}</a>` : esc(tel);

export function clientesRows({db, fCliente}){
  const q = norm(fCliente.q);
  const lista = resumoClientes(db).filter(c => !q || norm(c.nome).includes(q) || norm(c.telefone).includes(q));
  if(!lista.length) return `<p class="empty">${db.customers.length ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>`;
  return `<div class="tbl"><table>
    <thead><tr><th>Cliente</th><th>Telefone</th><th class="r">Compras</th><th class="r">Total gasto</th><th class="r">Ticket médio</th><th>Última compra</th><th></th></tr></thead>
    <tbody>${lista.map(c => `<tr><td>${esc(c.nome)}${c.obs ? `<small class="sub" style="display:block">${esc(c.obs)}</small>` : ''}</td>
      <td>${telefone(c.telefone)}</td><td class="r">${c.compras}</td><td class="r">${brl(c.total)}</td>
      <td class="r">${brl(c.ticket)}</td><td>${fmtDate(c.ultima)}</td>
      <td><div class="acts"><button class="btn small" data-act="verC" data-id="${c.id}">Compras</button>
      <button class="btn small" data-act="editC" data-id="${c.id}">Editar</button>
      <button class="btn small" data-act="delC" data-id="${c.id}">Excluir</button></div></td></tr>`).join('')}
    </tbody></table></div>`;
}

function historico(db, c){
  const compras = comprasDoCliente(db, c);
  return `<section class="card">
    <div class="card-head"><h2>Compras de ${esc(c.nome)}</h2><button class="btn small" data-act="closeVerC">Fechar</button></div>
    ${compras.length ? `<div class="tbl"><table>
      <thead><tr><th>Data</th><th>Produto</th><th class="r">Qtd</th><th class="r">Valor</th><th>Pagamento</th></tr></thead>
      <tbody>${compras.map(m => `<tr><td>${fmtDate(m.data)}</td><td>${esc(nomeProd(prod(db, m.productId)))}</td>
        <td class="r">${m.qty}</td><td class="r">${brl(m.valor)}</td><td>${esc(m.pagamento || '')}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">Este cliente ainda não comprou.</p>'}
  </section>`;
}

export default s => {
  const {db, editCliente, verCliente, fCliente} = s;
  const c = editCliente ? db.customers.find(x => x.id === editCliente) : null;
  const v = k => c ? esc(c[k] ?? '') : '';
  const ver = verCliente ? db.customers.find(x => x.id === verCliente) : null;
  return `
  <section class="card">
    <h2>${c ? 'Editar cliente' : 'Novo cliente'}</h2>
    <p class="hint">Quem estiver cadastrado aparece como sugestão ao registrar uma venda, e as compras dele ficam somadas aqui.</p>
    <form data-form="cliente" class="form">
      <input type="hidden" name="id" value="${c ? c.id : ''}">
      <label>Nome*<input name="nome" required value="${v('nome')}" autocomplete="off"></label>
      <label>Telefone ou WhatsApp<input name="telefone" type="tel" value="${v('telefone')}" placeholder="(85) 99999-0000"></label>
      <label class="wide">Observações<input name="obs" value="${v('obs')}" placeholder="Ex.: revende para a loja da prima"></label>
      <div class="actions wide">
        <button class="btn primary" type="submit">${c ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
        ${c ? '<button class="btn" type="button" data-act="cancelEditC">Cancelar</button>' : ''}
      </div>
    </form>
  </section>
  ${ver ? historico(db, ver) : ''}
  <section class="card">
    <h2>Clientes</h2>
    <div class="filters"><input data-f="c" data-k="q" type="search" placeholder="Buscar por nome ou telefone" value="${esc(fCliente.q)}"></div>
    <div id="cTbl">${clientesRows(s)}</div>
  </section>`;
};
