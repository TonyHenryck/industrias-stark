import { $, esc } from './format.js';
import { state } from './state.js';
import { TABS, VIEWS } from './views/index.js';
import { unidadesRows } from './views/unidades.js';
import { histRows } from './views/historico.js';
import { connect } from '../storage/index.js';
import { DomainError } from '../domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo } from '../domain/operations.js';
import { expText } from '../domain/reports.js';
import { CATALOGO_XDISTRIBUIDORA } from '../data/catalogo-xdistribuidora.js';

let store, unsubscribe = () => {}, busy = false;

function toast(msg, err=false){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', 2800);
}

const msgErro = e => e?.message || String(e);

// Erro inesperado nunca passa em silêncio: aparece na tela e no console.
window.addEventListener('error', e => toast('Erro inesperado: ' + msgErro(e.error ?? e.message), true));
window.addEventListener('unhandledrejection', e => toast('Erro inesperado: ' + msgErro(e.reason), true));

function render(){
  state.confirmImport = false;
  $('#tabs').innerHTML = TABS.map(([k,l]) =>
    `<button class="tab ${k===state.view?'on':''}" data-act="go" data-v="${k}" ${k===state.view?'aria-current="page"':''}>${l}</button>`).join('');
  $('#main').innerHTML = VIEWS[state.view](state);
}

function renderLogin(msg=''){
  $('#tabs').innerHTML = '';
  $('#user').innerHTML = '';
  $('#main').innerHTML = `
  <section class="card" style="max-width:420px;margin-inline:auto">
    <h2>Entrar</h2>
    <p class="hint">Acesso só para quem foi liberado no Supabase.</p>
    ${msg ? `<p class="alert">${esc(msg)}</p>` : ''}
    <form data-form="login" class="form" style="grid-template-columns:1fr">
      <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
      <label>Senha<input name="password" type="password" required autocomplete="current-password"></label>
      <div class="actions"><button class="btn primary" type="submit">Entrar</button></div>
    </form>
  </section>`;
}

/** Relê tudo do armazenamento. Em caso de falha, mantém o que já estava na tela. */
async function refresh(){ state.db = await store.load(); }

async function startSession(user){
  $('#user').innerHTML = user ? `${esc(user.email)} · <button class="btn small" data-act="logout">Sair</button>` : '';
  $('#main').innerHTML = '<p class="empty">Carregando…</p>';
  try{ await refresh(); }
  catch(e){ $('#main').innerHTML = `<p class="alert">Não foi possível carregar os dados: ${esc(msgErro(e))}</p>
    <p class="hint">Confira se o schema.sql foi executado e se o seu e-mail está em members.</p>`; return; }
  unsubscribe();
  unsubscribe = store.subscribe(async () => {
    if(busy) return;
    try{ await refresh(); }catch(e){ return; }
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if(!digitando && ['painel','unidades','historico'].includes(state.view)) render();
  });
  render();
}

/**
 * Roda uma ação do domínio: relê os dados mais recentes, aplica, grava e avisa.
 * Devolve true se deu certo.
 */
async function run(fn){
  if(busy) return false;
  busy = true;
  try{
    await refresh();
    const msg = fn();
    await store.save(state.db);
    if(msg) toast(msg);
    return true;
  }catch(e){
    if(e instanceof DomainError){ toast(e.message, true); return false; }
    toast('Não foi possível salvar: ' + msgErro(e), true);
    try{ await refresh(); }catch(_){}
    return false;
  }finally{ busy = false; }
}

async function importar(btn){
  let d;
  try{ d = parseBackup($('#imp').value); }
  catch(e){ if(e instanceof DomainError) return toast(e.message, true); throw e; }
  if(!state.confirmImport){ state.confirmImport = true; btn.textContent = 'Confirmar substituição'; return; }
  if(await run(() => { state.db = d; return 'Dados importados.'; })) render();
}

const FORMS = {
  produto: f => salvarProduto(state.db, f),
  entrada: f => addEntrada(state.db, f),
  venda:   f => addVenda(state.db, f),
  baixa:   f => addBaixa(state.db, f),
};

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const a = b.dataset.act;
  if(a==='go'){ state.view = b.dataset.v; state.editId = null; render(); window.scrollTo(0,0); }
  else if(a==='editP'){ state.editId = b.dataset.id; state.view = 'produtos'; render(); window.scrollTo(0,0); }
  else if(a==='cancelEdit'){ state.editId = null; render(); }
  else if(a==='delP'){ await run(() => excluirProduto(state.db, b.dataset.id)); render(); }
  else if(a==='importCatalogo'){ await run(() => importarCatalogo(state.db, CATALOGO_XDISTRIBUIDORA)); render(); }
  else if(a==='cancelVenda'){ await run(() => cancelarVenda(state.db, b.dataset.id)); render(); }
  else if(a==='logout'){ unsubscribe(); await store.auth.signOut(); }
  else if(a==='copy'){
    navigator.clipboard.writeText($('#exp').value)
      .then(() => toast('Copiado.'))
      .catch(() => { $('#exp').select(); toast('Selecione o texto e copie manualmente.', true); });
  }
  else if(a==='importar'){ await importar(b); }
});

document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, k = f.dataset.form;
  const dados = Object.fromEntries(new FormData(f));
  if(k==='login'){
    try{ await store.auth.signIn(dados.email, dados.password); }
    catch(err){ renderLogin('E-mail ou senha inválidos.'); }
    return;
  }
  if(FORMS[k] && await run(() => FORMS[k](dados))){
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

/* ---------- início ---------- */
store = await connect();
if(!store.auth){
  await startSession(null);
}else{
  let atual;  // undefined = ainda não decidido; null = sem sessão
  const entrar = async user => {
    if(atual !== undefined && (user?.id ?? null) === (atual?.id ?? null)) return;
    atual = user;
    if(user) await startSession(user); else { unsubscribe(); renderLogin(); }
  };
  store.auth.onChange(entrar);
  await entrar(await store.auth.user());
}
