import { esc } from './format.js';
import { buscar, BUSCA_MIN } from '../domain/reports.js';

const ROTULO = {produto:'Produtos', cliente:'Clientes', fornecedor:'Fornecedores', serie:'Números de série'};
const painel = () => document.getElementById('busca');
let sel = 0;

function itens(){ return [...painel().querySelectorAll('.busca-item')]; }
function marcar(i){
  const lista = itens(); if(!lista.length) return;
  sel = (i + lista.length) % lista.length;
  lista.forEach((el, k) => { el.classList.toggle('sel', k === sel); el.setAttribute('aria-selected', k === sel); });
  lista[sel].scrollIntoView({block:'nearest'});
}

function desenhar(db, texto){
  const alvo = painel().querySelector('.busca-lista');
  if(texto.trim().length < BUSCA_MIN){ alvo.innerHTML = `<p class="busca-vazio">Digite pelo menos ${BUSCA_MIN} letras: produto, cliente, telefone, fornecedor ou número de série.</p>`; return; }
  const r = buscar(db, texto);
  if(!r.length){ alvo.innerHTML = '<p class="busca-vazio">Nada encontrado.</p>'; return; }
  let atual = '';
  alvo.innerHTML = r.map(x => {
    const cab = x.tipo !== atual ? `<div class="busca-grupo">${ROTULO[x.tipo]}</div>` : '';
    atual = x.tipo;
    return `${cab}<button type="button" class="busca-item" role="option" data-act="buscaIr" data-tipo="${x.tipo}" data-id="${esc(x.id)}" data-serial="${esc(x.serial || '')}">
      <span>${esc(x.titulo)}</span><small>${esc(x.sub)}</small></button>`;
  }).join('');
  marcar(0);
}

export const buscaAberta = () => !painel().hidden;
export function fecharBusca(){ painel().hidden = true; document.body.classList.remove('busca-on'); }

export function abrirBusca(db){
  const p = painel(), campo = p.querySelector('input');
  p.hidden = false; document.body.classList.add('busca-on');
  campo.value = ''; desenhar(db, '');
  campo.focus();
}

/** Liga o campo, as setas e o Esc. `getDb` devolve o estado atual dos dados. */
export function iniciarBusca(getDb){
  const p = painel(), campo = p.querySelector('input');
  campo.addEventListener('input', () => desenhar(getDb(), campo.value));
  p.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ e.preventDefault(); fecharBusca(); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); marcar(sel + 1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); marcar(sel - 1); }
    else if(e.key === 'Enter'){ e.preventDefault(); itens()[sel]?.click(); }
  });
  p.addEventListener('click', e => { if(e.target === p) fecharBusca(); });
  document.addEventListener('keydown', e => {
    if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !document.body.classList.contains('auth')){
      e.preventDefault(); buscaAberta() ? fecharBusca() : abrirBusca(getDb());
    }
  });
}
