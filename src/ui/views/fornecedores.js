import { esc, brl, fmtDate } from '../format.js';
import { resumoFornecedores } from '../../domain/reports.js';
import { norm } from '../../domain/queries.js';

export default ({db, editFornecedor}) => {
  const f = editFornecedor ? db.suppliers.find(x => x.id === editFornecedor) : null;
  const v = k => f ? esc(f[k] ?? '') : '';
  const lista = resumoFornecedores(db);
  const temX = db.suppliers.some(x => norm(x.nome) === 'xdistribuidora');

  const tabela = lista.length ? `<div class="tbl"><table>
    <thead><tr><th>Fornecedor</th><th>Pedido mínimo</th><th>Prazo</th><th>Pagamento</th><th class="r">Compras</th><th class="r">Total comprado</th><th>Última</th><th></th></tr></thead>
    <tbody>${lista.map(x => `<tr>
      <td>${esc(x.nome)}${x.contato ? `<small class="sub" style="display:block">${esc(x.contato)}</small>` : ''}${x.site ? `<small class="sub" style="display:block;white-space:normal">${esc(x.site)}</small>` : ''}</td>
      <td style="white-space:normal;min-width:120px;max-width:200px">${esc(x.pedidoMinimo || '')}</td><td style="white-space:normal">${esc(x.prazo || '')}</td>
      <td style="white-space:normal;min-width:110px;max-width:200px">${esc(x.pagamento || '')}</td>
      <td class="r">${x.entradas}</td><td class="r">${brl(x.total)}</td><td>${fmtDate(x.ultima)}</td>
      <td><div class="acts"><button class="btn small" data-act="editF" data-id="${x.id}">Editar</button>
      <button class="btn small" data-act="delF" data-id="${x.id}">Excluir</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhum fornecedor cadastrado ainda.</p>';

  return `
  ${!f && !temX ? `<section class="card">
    <h2>Fornecedor do catálogo</h2>
    <p class="hint">Cadastra a XDistribuidora com as condições do catálogo: pedido mínimo, prazo e forma de pagamento.</p>
    <div class="actions"><button class="btn" data-act="addXDist">Adicionar XDistribuidora</button></div>
  </section>` : ''}
  <section class="card">
    <h2>${f ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
    <p class="hint">Quem estiver cadastrado aparece como sugestão ao registrar uma entrada, e o total comprado fica somado aqui.</p>
    <form data-form="fornecedor" class="form">
      <input type="hidden" name="id" value="${f ? f.id : ''}">
      <label>Nome*<input name="nome" required value="${v('nome')}" autocomplete="off"></label>
      <label>Contato (telefone ou WhatsApp)<input name="contato" value="${v('contato')}"></label>
      <label>Site de pedidos<input name="site" value="${v('site')}"></label>
      <label>Pedido mínimo<input name="pedidoMinimo" value="${v('pedidoMinimo')}" placeholder="Ex.: 5 peças"></label>
      <label>Prazo de envio<input name="prazo" value="${v('prazo')}" placeholder="Ex.: 48 horas"></label>
      <label>Forma de pagamento<input name="pagamento" value="${v('pagamento')}" placeholder="Ex.: Pix"></label>
      <label class="wide">Observações<textarea name="obs" rows="2">${v('obs')}</textarea></label>
      <div class="actions wide">
        <button class="btn primary" type="submit">${f ? 'Salvar alterações' : 'Cadastrar fornecedor'}</button>
        ${f ? '<button class="btn" type="button" data-act="cancelEditF">Cancelar</button>' : ''}
      </div>
    </form>
  </section>
  <section class="card"><h2>Fornecedores</h2>${tabela}</section>`;
};
