import { $ } from './format.js';
import { state } from './state.js';
import { TABS, VIEWS } from './views/index.js';
import { unidadesRows } from './views/unidades.js';
import { histRows } from './views/historico.js';
import { load, save } from '../storage/local.js';
import { DomainError } from '../domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup } from '../domain/operations.js';
import { expText } from '../domain/reports.js';

state.db = load();

function toast(msg, err=false){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', 2800);
}

function render(){
  state.confirmImport = false;
  $('#tabs').innerHTML = TABS.map(([k,l]) =>
    `<button class="tab ${k===state.view?'on':''}" data-act="go" data-v="${k}" ${k===state.view?'aria-current="page"':''}>${l}</button>`).join('');
  $('#main').innerHTML = VIEWS[state.view](state);
}

/** Roda uma ação do domínio: salva e mostra a mensagem, ou mostra o erro. Devolve true se deu certo. */
function run(fn){
  let msg;
  try{ msg = fn(); }
  catch(e){
    if(e instanceof DomainError){ toast(e.message, true); return false; }
    throw e;
  }
  if(!save(state.db)) toast('Não foi possível salvar neste navegador.', true);
  else if(msg) toast(msg);
  return true;
}

function importar(btn){
  let d;
  try{ d = parseBackup($('#imp').value); }
  catch(e){ if(e instanceof DomainError) return toast(e.message, true); throw e; }
  if(!state.confirmImport){ state.confirmImport = true; btn.textContent = 'Confirmar substituição'; return; }
  state.db = d; save(d); render();
  toast('Dados importados.');
}

const FORMS = {
  produto: f => salvarProduto(state.db, f),
  entrada: f => addEntrada(state.db, f),
  venda:   f => addVenda(state.db, f),
  baixa:   f => addBaixa(state.db, f),
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const a = b.dataset.act;
  if(a==='go'){ state.view = b.dataset.v; state.editId = null; render(); window.scrollTo(0,0); }
  else if(a==='editP'){ state.editId = b.dataset.id; state.view = 'produtos'; render(); window.scrollTo(0,0); }
  else if(a==='cancelEdit'){ state.editId = null; render(); }
  else if(a==='delP'){ run(() => excluirProduto(state.db, b.dataset.id)); render(); }
  else if(a==='cancelVenda'){ run(() => cancelarVenda(state.db, b.dataset.id)); render(); }
  else if(a==='copy'){
    navigator.clipboard.writeText($('#exp').value)
      .then(() => toast('Copiado.'))
      .catch(() => { $('#exp').select(); toast('Selecione o texto e copie manualmente.', true); });
  }
  else if(a==='importar'){ importar(b); }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, k = f.dataset.form;
  const dados = Object.fromEntries(new FormData(f));
  if(FORMS[k] && run(() => FORMS[k](dados))){
    if(k==='produto') state.editId = null;
    render();
  }
});

document.addEventListener('input', e => {
  const t = e.target;
  if(!t.dataset.f) return;
  const u = t.dataset.f==='u';
  (u ? state.fUnit : state.fHist)[t.dataset.k] = t.value;
  $(u ? '#uTbl' : '#hTbl').innerHTML = (u ? unidadesRows : histRows)(state);
});

document.addEventListener('change', e => {
  const t = e.target;
  if(t.id==='per'){ state.periodo = t.value; render(); }
  if(t.id==='expFmt'){ $('#exp').value = expText(state.db, t.value); }
});

render();
