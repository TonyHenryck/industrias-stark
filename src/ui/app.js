import { $, esc } from './format.js';
import { state } from './state.js';
import { TABS, VIEWS } from './views/index.js';
import { ICONS, logo } from './icons.js';
import { iniciarTips } from './charts.js';
import { iniciarBusca, abrirBusca, fecharBusca } from './busca.js';
import { redimensionar } from './foto.js';
import { uid } from '../domain/util.js';
import { unidadesRows } from './views/unidades.js';
import { histRows } from './views/historico.js';
import { clientesRows } from './views/clientes.js';
import { garantiaRows } from './views/movimentos.js';
import { connect } from '../storage/index.js';
import { DomainError } from '../domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo, addDespesa, excluirDespesa, salvarCliente, excluirCliente, salvarFornecedor, excluirFornecedor, addContaPagar, pagarConta, desfazerPagamento, excluirConta, adicionarFoto, removerFoto, salvarMeta, devolverVenda } from '../domain/operations.js';
import { expText, conferirCaixa, contas as contasDe, resumo } from '../domain/reports.js';
import { CATALOGO_XDISTRIBUIDORA, FORNECEDOR_XDISTRIBUIDORA } from '../data/catalogo-xdistribuidora.js';

let store, unsubscribe = () => {}, busy = false;

function toast(msg, err=false){
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.className = '', Math.min(9000, Math.max(2800, msg.length * 60)));   // aviso longo fica mais tempo
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
  const cont = {contas: contasDe(state.db).qtdVencidas, produtos: resumo(state.db, 'tudo').alertas.length};
  const aviso = {contas: 'conta(s) vencida(s)', produtos: 'produto(s) com estoque baixo'};
  $('#tabs').innerHTML = TABS.map(([k,l]) =>
    `<button class="tab ${k===state.view?'on':''}" data-act="go" data-v="${k}" title="${l}${cont[k] ? ` · ${cont[k]} ${aviso[k]}` : ''}" ${k===state.view?'aria-current="page"':''}>${ICONS[k]}<span>${l}</span>${cont[k] ? `<em class="cont" aria-label="${cont[k]} ${aviso[k]}">${cont[k]}</em>` : ''}</button>`).join('');
  $('#titulo').textContent = (TABS.find(([k]) => k === state.view) || [])[1] || '';
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

let introFeita = false;   // a animação de abertura toca só na primeira vez; um erro de senha não a repete

function renderLogin(msg=''){
  document.body.classList.add('auth');
  $('#tabs').innerHTML = '';
  $('#user').innerHTML = '';
  $('#main').classList.remove('enter');
  const intro = !introFeita; introFeita = true;
  const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  $('#main').innerHTML = `
  <div class="login-fundo" aria-hidden="true"><i></i><i></i><i></i></div>
  <section class="login ${intro ? 'com-intro' : ''}">
    <div class="login-in">
      ${intro ? `<div class="login-splash" aria-hidden="true"><span class="anel a1"></span><span class="anel a2"></span><div class="logo">${logo('logoSplash')}</div></div>` : ''}
      <div class="login-conteudo">
        <div class="logo">${logo('logoLogin')}</div>
        <h2>Bem-vindo <span>de volta</span></h2>
        ${msg ? `<p class="alert" role="alert">${esc(msg)}</p>` : ''}
        <form data-form="login" class="form" style="grid-template-columns:1fr">
          <label>E-mail<span class="campo">${ico('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>')}<input name="email" type="email" required autocomplete="username" autofocus placeholder="voce@exemplo.com"></span></label>
          <label>Senha<span class="campo">${ico('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')}<input name="password" type="password" required autocomplete="current-password" placeholder="Sua senha">
            <button type="button" class="ver-senha" data-act="verSenha" aria-label="Mostrar senha" aria-pressed="false">${ico('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')}</button></span></label>
          <div class="actions"><button class="btn primary" type="submit">Entrar <span aria-hidden="true">→</span></button></div>
        </form>
      </div>
    </div>
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
  meta: f => salvarMeta(state.db, f),
  devolucao: f => devolverVenda(state.db, f),
  pagamentoParcial: f => pagarConta(state.db, f.id, f.data, {valor:f.valor, vencimento:f.vencimento}),
};

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if(!b) return;
  const a = b.dataset.act;
  if(a==='verSenha'){ const c = b.closest('.campo').querySelector('input'), ver = c.type === 'password'; c.type = ver ? 'text' : 'password'; b.setAttribute('aria-pressed', String(ver)); b.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha'); return; }
  if(a==='recarregar'){ location.reload(); return; }
  if(a==='abrirBusca'){ abrirBusca(state.db); return; }
  if(a==='maisMenu'){ const pop = $('#maisPop'); pop.hidden = !pop.hidden; b.setAttribute('aria-expanded', String(!pop.hidden)); return; }
  $('#maisPop').hidden = true;
  if(a==='buscaIr'){
    const {tipo, id, serial} = b.dataset;
    state.editId = state.editCliente = state.editFornecedor = state.verCliente = null;
    if(tipo==='produto'){ state.view = 'produtos'; state.editId = id; }
    else if(tipo==='cliente'){ state.view = 'clientes'; state.verCliente = id; }
    else if(tipo==='fornecedor'){ state.view = 'fornecedores'; state.editFornecedor = id; }
    else { state.view = 'unidades'; state.fUnit = {st:'todos', pid:'', q:serial}; }
    fecharBusca(); render(true); window.scrollTo(0,0); return;
  }
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
  else if(a==='parcialC'){ state.parcial = state.parcial === b.dataset.id ? null : b.dataset.id; render(); }
  else if(a==='devolverV'){ state.devolver = state.devolver === b.dataset.id ? null : b.dataset.id; render(); }
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
  if(k==='conferencia'){
    try{ state.conferencia = {campos: dados, resultado: conferirCaixa(state.db, dados)}; }
    catch(err){ if(!(err instanceof DomainError)) throw err; state.conferencia = {campos: dados, erro: err.message}; }
    render(); return;
  }
  if(FORMS[k] && await run(() => FORMS[k](dados))){
    if(k==='produto') state.editId = dados.id ? null : state.db.products.at(-1)?.id ?? null;   // produto novo: reabre para já poder enviar a foto
    if(k==='cliente') state.editCliente = null;
    if(k==='fornecedor') state.editFornecedor = null;
    if(k==='pagamentoParcial') state.parcial = null;
    if(k==='devolucao') state.devolver = null;
    render();
  }
});

const FILTROS = {
  u: [() => state.fUnit, '#uTbl', unidadesRows],
  h: [() => state.fHist, '#hTbl', histRows],
  c: [() => state.fCliente, '#cTbl', clientesRows],
  g: [() => state.fGarantia, '#gTbl', garantiaRows],
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
iniciarBusca(() => state.db);
document.addEventListener('click', e => { if(!e.target.closest('.top-mais')){ const p = $('#maisPop'); if(p) p.hidden = true; } });
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ const p = $('#maisPop'); if(p) p.hidden = true; } });
aplicarBarra(barraGuardada());
async function iniciar(){
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
}

/** Falha ao abrir o app (por exemplo, o Supabase não carregou): nunca deixa a tela em branco. */
function renderFalhaInicial(e){
  document.body.classList.remove('auth');
  const m = e?.message || String(e);
  const rede = /dynamically imported module|Failed to fetch|NetworkError|Load failed/i.test(m);
  $('#main').innerHTML = `<section class="card">
    <h2>Não foi possível abrir o sistema</h2>
    <p class="alert">${rede ? 'Um arquivo necessário não carregou. Isso costuma ser internet instável, bloqueador de anúncios, VPN ou antivírus.' : esc(msgErro(e))}</p>
    <p class="hint">Confira a conexão e clique em Tentar de novo. Se continuar, tente outra rede ou desative o bloqueador para este site. Seus dados continuam salvos.</p>
    ${rede ? `<p class="hint mono">${esc(m)}</p>` : ''}
    <div class="actions"><button class="btn primary" data-act="recarregar">Tentar de novo</button></div></section>`;
}

try{ await iniciar(); }catch(e){ console.error(e); renderFalhaInicial(e); }
