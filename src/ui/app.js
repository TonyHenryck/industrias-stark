import { $, esc } from './format.js';
import { state } from './state.js';
import { TABS, VIEWS } from './views/index.js';
import { ICONS, logo } from './icons.js';
import { iniciarTips } from './charts.js';
import { redimensionar } from './foto.js';
import { uid } from '../domain/util.js';
import { unidadesRows } from './views/unidades.js';
import { histRows } from './views/historico.js';
import { clientesRows } from './views/clientes.js';
import { connect } from '../storage/index.js';
import { DomainError } from '../domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo, addDespesa, excluirDespesa, salvarCliente, excluirCliente, salvarFornecedor, excluirFornecedor, addContaPagar, pagarConta, desfazerPagamento, excluirConta, adicionarFoto, removerFoto } from '../domain/operations.js';
import { expText } from '../domain/reports.js';
import { CATALOGO_XDISTRIBUIDORA, FORNECEDOR_XDISTRIBUIDORA } from '../data/catalogo-xdistribuidora.js';

let store, unsubscribe = () => {}, busy = false;

function toast(msg, err=false){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', 2800);
}

const SQL_LIBERAR = "insert into public.members (user_id)\nselect id from auth.users where email = 'SEU_EMAIL_AQUI'\non conflict do nothing;";

const msgErro = e => {
  const m = e?.message || String(e);
  if(/bucket not found/i.test(m)) return 'O espaço de fotos ainda não existe no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor.';
  return /row-level security|permission denied/i.test(m)
    ? 'Sem permissão: este usuário não está liberado no Supabase (tabela members) ou as políticas do schema.sql não foram criadas.'
    : m;
};

// Erro inesperado nunca passa em silêncio: aparece na tela e no console.
window.addEventListener('error', e => toast('Erro inesperado: ' + msgErro(e.error ?? e.message), true));
window.addEventListener('unhandledrejection', e => toast('Erro inesperado: ' + msgErro(e.reason), true));

function render(animar = false){
  state.confirmImport = false;
  $('#tabs').innerHTML = TABS.map(([k,l]) =>
    `<button class="tab ${k===state.view?'on':''}" data-act="go" data-v="${k}" title="${l}" ${k===state.view?'aria-current="page"':''}>${ICONS[k]}<span>${l}</span></button>`).join('');
  const main = $('#main');
  main.classList.toggle('enter', animar);
  main.innerHTML = VIEWS[state.view](state);
}

/** Barra lateral recolhida ou aberta; a escolha fica guardada neste navegador. */
function aplicarBarra(recolhida){
  document.body.classList.toggle('collapsed', recolhida);
  const b = $('#sideToggle'), t = recolhida ? 'Expandir menu' : 'Recolher menu';
  b.setAttribute('aria-label', t); b.title = t;
}
function lembrarBarra(recolhida){ try{ localStorage.setItem('estoque-barra-recolhida', recolhida ? '1' : '0'); }catch(e){} }
function barraGuardada(){ try{ return localStorage.getItem('estoque-barra-recolhida') === '1'; }catch(e){ return false; } }

function renderLogin(msg=''){
  document.body.classList.add('auth');
  $('#tabs').innerHTML = '';
  $('#user').innerHTML = '';
  $('#main').classList.remove('enter');
  $('#main').innerHTML = `
  <section class="login">
    <div class="logo">${logo('logoLogin')}</div>
    <h2>Indústrias Stark</h2>
    <p class="login-sub">Estoque de smartwatches. Acesso só para quem foi liberado.</p>
    ${msg ? `<p class="alert" role="alert">${esc(msg)}</p>` : ''}
    <form data-form="login" class="form" style="grid-template-columns:1fr">
      <label>E-mail<input name="email" type="email" required autocomplete="username" autofocus></label>
      <label>Senha<input name="password" type="password" required autocomplete="current-password"></label>
      <div class="actions"><button class="btn primary" type="submit">Entrar</button></div>
    </form>
  </section>`;
}

const TEMPO_MAX_MS = 20000;
const comTempo = (promessa, ms) => Promise.race([promessa,
  new Promise((_, rej) => setTimeout(() => rej(new Error(`O servidor não respondeu em ${ms/1000} segundos.`)), ms))]);

/** Relê tudo do armazenamento. Em caso de falha, mantém o que já estava na tela. */
async function refresh(){ state.db = await comTempo(store.load(), TEMPO_MAX_MS); }

const textoRodape = () => store.kind === 'remote'
  ? 'Os dados ficam salvos na nuvem (Supabase) e aparecem para quem tem acesso. Faça backup em Dados.'
  : 'Os dados ficam salvos neste navegador. Faça backup em Dados.';

let usuarioAtual = null;

async function startSession(user){
  usuarioAtual = user;
  document.body.classList.remove('auth');
  $('.head .sub').textContent = textoRodape();
  $('#user').innerHTML = user ? `<span class="side-user" title="${esc(user.email)}">${esc(user.email)}</span><button class="btn small" data-act="logout">Sair</button>` : '';
  $('#main').innerHTML = '<p class="empty">Carregando…</p>';
  try{
    if(store.auth && !(await comTempo(store.auth.isMember(), TEMPO_MAX_MS))){
      $('#main').innerHTML = `<section class="card"><h2>Acesso ainda não liberado</h2>
        <p class="alert">O usuário ${esc(user.email)} entrou, mas ainda não foi liberado para ver os dados.</p>
        <p class="hint">No Supabase, abra o SQL Editor e rode o comando abaixo com o e-mail certo. Depois clique em Tentar de novo.</p>
        <textarea rows="4" readonly class="mono">${esc(SQL_LIBERAR)}</textarea>
        <div class="actions" style="margin-top:8px"><button class="btn" data-act="retry">Tentar de novo</button></div></section>`;
      return;
    }
    await refresh();
  }
  catch(e){ $('#main').innerHTML = `<section class="card"><p class="alert">Não foi possível carregar os dados: ${esc(msgErro(e))}</p>
    <p class="hint">Confira a conexão, se o schema.sql foi executado e se o seu e-mail está em members.</p>
    <div class="actions"><button class="btn" data-act="retry">Tentar de novo</button></div></section>`; return; }
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

/** Reduz a foto, envia para o Supabase e só então a vincula ao produto. */
async function enviarFoto(arquivo){
  const pid = state.editId;
  if(!pid || !store.fotos) return;
  toast('Enviando a foto…');
  let caminho;
  try{
    const blob = await redimensionar(arquivo);
    caminho = `${pid}/${uid()}.jpg`;
    await store.fotos.enviar(caminho, blob);
  }catch(e){ return toast('Não foi possível enviar a foto: ' + msgErro(e), true); }
  if(!(await run(() => adicionarFoto(state.db, pid, caminho)))) store.fotos.remover(caminho).catch(() => {});
  render();
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
  despesa: f => addDespesa(state.db, f),
  cliente: f => salvarCliente(state.db, f),
  fornecedor: f => salvarFornecedor(state.db, f),
  conta: f => addContaPagar(state.db, f),
};

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const a = b.dataset.act;
  if(a==='go'){ state.view = b.dataset.v; state.editId = state.editCliente = state.editFornecedor = state.verCliente = null; render(true); window.scrollTo(0,0); }
  else if(a==='editP'){ state.editId = b.dataset.id; state.view = 'produtos'; render(); window.scrollTo(0,0); }
  else if(a==='cancelEdit'){ state.editId = null; render(); }
  else if(a==='delP'){ await run(() => excluirProduto(state.db, b.dataset.id)); render(); }
  else if(a==='importCatalogo'){ await run(() => importarCatalogo(state.db, CATALOGO_XDISTRIBUIDORA)); render(); }
  else if(a==='delDespesa'){ await run(() => excluirDespesa(state.db, b.dataset.id)); render(); }
  else if(a==='metrica'){ state.metrica = b.dataset.v; render(); }
  else if(a==='editC'){ state.editCliente = b.dataset.id; render(); window.scrollTo(0,0); }
  else if(a==='cancelEditC'){ state.editCliente = null; render(); }
  else if(a==='verC'){ state.verCliente = b.dataset.id; render(); window.scrollTo(0,0); }
  else if(a==='closeVerC'){ state.verCliente = null; render(); }
  else if(a==='delC'){ if(state.verCliente === b.dataset.id) state.verCliente = null; await run(() => excluirCliente(state.db, b.dataset.id)); render(); }
  else if(a==='editF'){ state.editFornecedor = b.dataset.id; render(); window.scrollTo(0,0); }
  else if(a==='cancelEditF'){ state.editFornecedor = null; render(); }
  else if(a==='delF'){ await run(() => excluirFornecedor(state.db, b.dataset.id)); render(); }
  else if(a==='addXDist'){ await run(() => salvarFornecedor(state.db, FORNECEDOR_XDISTRIBUIDORA)); render(); }
  else if(a==='pagarC'){ await run(() => pagarConta(state.db, b.dataset.id)); render(); }
  else if(a==='desfazerC'){ await run(() => desfazerPagamento(state.db, b.dataset.id)); render(); }
  else if(a==='delConta'){ await run(() => excluirConta(state.db, b.dataset.id)); render(); }
  else if(a==='contaTipo'){ state.contaTipo = b.dataset.v; render(); }
  else if(a==='pickFoto'){ $('#fotoInput').click(); }
  else if(a==='delFoto'){
    const caminho = b.dataset.path, pid = state.editId;
    if(await run(() => removerFoto(state.db, pid, caminho))) store.fotos?.remover(caminho).catch(() => {});   // o arquivo órfão é inofensivo se falhar
    render();
  }
  else if(a==='cancelVenda'){ await run(() => cancelarVenda(state.db, b.dataset.id)); render(); }
  else if(a==='toggleSidebar'){ const r = !document.body.classList.contains('collapsed'); aplicarBarra(r); lembrarBarra(r); }
  else if(a==='retry'){ await startSession(usuarioAtual); }
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
    if(k==='cliente') state.editCliente = null;
    if(k==='fornecedor') state.editFornecedor = null;
    render();
  }
});

const FILTROS = {
  u: [() => state.fUnit, '#uTbl', unidadesRows],
  h: [() => state.fHist, '#hTbl', histRows],
  c: [() => state.fCliente, '#cTbl', clientesRows],
};
document.addEventListener('input', e => {
  const t = e.target, f = FILTROS[t.dataset.f];
  if(!f) return;
  f[0]()[t.dataset.k] = t.value;
  $(f[1]).innerHTML = f[2](state);
});

document.addEventListener('change', async e => {
  const t = e.target;
  if(t.id==='per'){ state.periodo = t.value; render(); }
  if(t.id==='fotoInput' && t.files[0]){ const f = t.files[0]; t.value = ''; await enviarFoto(f); }
  if(t.id==='contaStatus'){ state.contaStatus = t.value; render(); }
  if(t.dataset.toggle){                      // mostra os campos de vencimento só quando for a prazo
    const mostrar = t.value === t.dataset.valor;
    t.closest('form').querySelectorAll('.' + t.dataset.toggle).forEach(el => { el.hidden = !mostrar; });
  }
  if(t.id==='expFmt'){ $('#exp').value = expText(state.db, t.value); }
});

/* ---------- início ---------- */
$('#brandLogo').innerHTML = logo('logoMenu');
iniciarTips();
aplicarBarra(barraGuardada());
store = await connect();
state.fotoUrl = store.fotos ? c => store.fotos.url(c) : null;
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
