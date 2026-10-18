import { esc, brl } from '../format.js';
import { prod, stock } from '../../domain/queries.js';
import { MAX_FOTOS } from '../../domain/operations.js';
import { datalist } from '../shared.js';
import { CATALOGO_XDISTRIBUIDORA, CATALOGO_DATA } from '../../data/catalogo-xdistribuidora.js';

const thumb = (x, url) => {
  const c = x.fotos?.[0];
  return `<td style="width:48px">${c && url ? `<img class="thumb" src="${esc(url(c))}" alt="Foto de ${esc(x.nome)}" loading="lazy">` : `<button type="button" class="thumb vazio" data-act="editP" data-id="${x.id}" title="Adicionar foto" aria-label="Adicionar foto de ${esc(x.nome)}">+</button>`}</td>`;
};

function painelFotos(p, url){
  if(!p) return '';
  if(!url) return `<div class="fotos-box"><h2>Fotos</h2><p class="hint">As fotos ficam guardadas na nuvem e só funcionam com o Supabase configurado.</p></div>`;
  const fotos = p.fotos || [];
  return `<div class="fotos-box">
    <h2>Fotos <small class="sub">(${fotos.length} de ${MAX_FOTOS})</small></h2>
    <p class="hint">A foto é reduzida antes de enviar, então pode escolher direto da câmera do celular.</p>
    <div class="fotos">
      ${fotos.map(c => `<figure class="foto"><a href="${esc(url(c))}" target="_blank" rel="noopener noreferrer"><img src="${esc(url(c))}" alt="Foto de ${esc(p.nome)}" loading="lazy"></a>
        <button type="button" class="btn small" data-act="delFoto" data-path="${esc(c)}">Remover</button></figure>`).join('')}
      ${fotos.length < MAX_FOTOS ? `<button type="button" class="foto-add" data-act="pickFoto" aria-label="Adicionar foto"><span>+</span>Adicionar foto</button>` : ''}
    </div>
    <input type="file" id="fotoInput" accept="image/*" hidden>
  </div>`;
}

export default ({db, editId, fotoUrl}) => {
  const p = editId ? prod(db, editId) : null;
  const v = k => p ? esc(p[k] ?? '') : '';
  const lista = db.products.length ? `<div class="tbl"><table>
    <thead><tr><th></th><th>Modelo</th><th>Marca</th><th>Variante</th><th class="r">Estoque</th><th class="r">Custo padrão</th><th class="r">Preço padrão</th><th>Fornecedor</th><th></th></tr></thead>
    <tbody>${db.products.map(x => `<tr>${thumb(x, fotoUrl)}<td>${esc(x.nome)}</td><td>${esc(x.marca||'')}</td><td>${esc(x.variante||'')}</td>
      <td class="r">${stock(db, x.id)}</td><td class="r">${brl(x.custoPadrao)}</td><td class="r">${brl(x.precoPadrao)}</td>
      <td>${esc(x.fornecedor||'')}</td>
      <td><div class="acts"><button class="btn small" data-act="editP" data-id="${x.id}">Editar</button>
      <button class="btn small" data-act="delP" data-id="${x.id}">Excluir</button></div></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty">Nenhum produto cadastrado.</p>';
  const importar = p ? '' : `
  <section class="card">
    <h2>Catálogo do fornecedor</h2>
    <p class="hint">Cadastra os ${CATALOGO_XDISTRIBUIDORA.length} itens da XDistribuidora (catálogo de ${CATALOGO_DATA}) com custo de atacado (5 a 50 peças) e preço sugerido de revenda quando existe. Quem já está cadastrado não é alterado.</p>
    <div class="actions"><button class="btn" data-act="importCatalogo">Importar catálogo</button></div>
  </section>`;
  return `${importar}
  <section class="card">
    <h2>${p ? 'Editar produto' : 'Novo produto'}</h2>
    <form data-form="produto" class="form">
      <input type="hidden" name="id" value="${p ? p.id : ''}">
      <label>Modelo*<input name="nome" required value="${v('nome')}" placeholder="Ex.: Amazfit Bip 5"></label>
      <label>Marca<input name="marca" value="${v('marca')}"></label>
      <label>Cor ou variante<input name="variante" value="${v('variante')}" placeholder="Ex.: Preto 46 mm"></label>
      <label>Custo padrão (R$)<input name="custoPadrao" type="number" step="0.01" min="0" value="${p ? p.custoPadrao : ''}"></label>
      <label>Preço de venda padrão (R$)<input name="precoPadrao" type="number" step="0.01" min="0" value="${p ? p.precoPadrao : ''}"></label>
      <label>Estoque mínimo (alerta)<input name="minimo" type="number" min="0" value="${p ? p.minimo : ''}"></label>
      <label>Fornecedor padrão<input name="fornecedor" value="${v('fornecedor')}" list="listaFornecedores" autocomplete="off">${datalist('listaFornecedores', db.suppliers)}</label>
      <label class="wide">Observações<textarea name="obs" rows="2">${v('obs')}</textarea></label>
      <div class="actions wide">
        <button class="btn primary" type="submit">${p ? 'Salvar alterações' : 'Cadastrar produto'}</button>
        ${p ? '<button class="btn" type="button" data-act="cancelEdit">Cancelar</button>' : ''}
      </div>
    </form>
    ${p ? painelFotos(p, fotoUrl) : '<p class="hint" style="margin:16px 0 0">Fotos: depois de cadastrar, esta tela reabre com o botão <b>Adicionar foto</b>. Dá para enviar até 3 por produto. Para produtos já cadastrados, clique no quadrado <b>+</b> da lista ou em Editar.</p>'}
  </section>
  <section class="card"><h2>Produtos cadastrados</h2>${lista}</section>`;
};
