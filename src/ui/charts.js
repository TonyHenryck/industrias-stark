/*
 * Gráficos em HTML/CSS, sem biblioteca. Seguem as regras de visualização do projeto:
 * uma série por gráfico, marcas finas, valor escrito (nunca só cor), tooltip que enriquece
 * mas não é a única forma de ler, e uma tabela equivalente.
 */
import { esc, brl } from './format.js';

const compacto = n => new Intl.NumberFormat('pt-BR', {notation:'compact', maximumFractionDigits:1}).format(n);

/** Topo "redondo" do eixo: 1, 2, 5 ou 10 vezes uma potência de 10. */
export function maxBonito(v){
  if(!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v)), f = v / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
}

/**
 * Colunas no tempo. `pontos`: [{rotulo, valor, tip}] (um por dia ou mês).
 * O maior valor leva o rótulo direto; o resto fica no eixo, no tooltip e na tabela.
 */
export function colunas({pontos, nome, colunaTabela}){
  const maxV = Math.max(...pontos.map(p => p.valor), 0);
  const topo = maxBonito(maxV);
  const iMax = maxV > 0 ? pontos.findIndex(p => p.valor === maxV) : -1;
  const passo = Math.ceil(pontos.length / 6);          // no máximo ~6 rótulos no eixo x
  const n = pontos.length;

  const cols = pontos.map((p, i) => {
    const h = p.valor > 0 ? Math.max(p.valor / topo * 100, 1.5) : 0;
    const lado = i < 3 ? 'ini' : i > n - 4 ? 'fim' : '';
    return `<button type="button" class="viz-col" data-tip="${esc(p.tip)}" aria-label="${esc(p.tip)}">
      <span class="viz-wrap" style="--h:${h}%">
        <span class="viz-bar"></span>
        ${i === iMax ? `<span class="viz-val ${lado}">${esc(brl(p.valor))}</span>` : ''}
      </span></button>`;
  }).join('');

  const eixo = pontos.map((p, i) => `<span>${(n - 1 - i) % passo === 0 ? esc(p.rotulo) : ''}</span>`).join('');
  const ticks = [1, .5, 0].map(f => `<span style="bottom:${f * 100}%">${f ? compacto(topo * f) : '0'}</span>`).join('');
  const linhas = pontos.map(p => `<tr><td>${esc(p.rotulo)}</td><td class="r">${esc(brl(p.valor))}</td></tr>`).join('');

  return `<div class="viz" data-viz>
    <div class="viz-plot" role="group" aria-label="${esc(nome)}">
      <div class="viz-y" aria-hidden="true">${ticks}</div>
      <div class="viz-body">
        <div class="viz-grid" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="viz-cols">${cols}</div>
      </div>
    </div>
    <div class="viz-x" aria-hidden="true"><div class="viz-xs">${eixo}</div></div>
    <details class="viz-table"><summary>Ver como tabela</summary>
      <div class="tbl"><table><thead><tr><th>Período</th><th class="r">${esc(colunaTabela)}</th></tr></thead><tbody>${linhas}</tbody></table></div>
    </details>
    <div class="viz-tip" role="tooltip" hidden></div>
  </div>`;
}

/**
 * Barras horizontais: rótulo, barra e valor escrito ao lado (o valor nunca fica dentro da barra).
 * `itens`: [{rotulo, sub?, valor, texto}]
 */
export function barras(itens){
  const maxV = Math.max(...itens.map(i => i.valor), 0);
  return `<ul class="hbars">${itens.map(i => `
    <li>
      <span class="hb-label">${esc(i.rotulo)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>
      <span class="hb-track" aria-hidden="true"><span class="hb-fill" style="width:${maxV > 0 ? Math.max(i.valor / maxV * 100, 1.5) : 0}%"></span></span>
      <span class="hb-val">${esc(i.texto)}</span>
    </li>`).join('')}</ul>`;
}

/** Tooltip das colunas: aparece ao passar o mouse ou ao focar com o teclado. */
export function iniciarTips(){
  const mostrar = col => {
    const viz = col.closest('[data-viz]'), tip = viz.querySelector('.viz-tip');
    tip.textContent = col.dataset.tip; tip.hidden = false;
    const v = viz.getBoundingClientRect(), c = col.getBoundingClientRect();
    const x = c.left - v.left + c.width / 2;
    tip.style.left = Math.min(Math.max(x, tip.offsetWidth / 2 + 4), v.width - tip.offsetWidth / 2 - 4) + 'px';
  };
  const esconder = col => { const tip = col.closest('[data-viz]')?.querySelector('.viz-tip'); if(tip) tip.hidden = true; };
  const alvo = e => e.target.closest?.('.viz-col');
  document.addEventListener('mouseover', e => { const c = alvo(e); if(c) mostrar(c); });
  document.addEventListener('focusin',   e => { const c = alvo(e); if(c) mostrar(c); });
  document.addEventListener('mouseout',  e => { const c = alvo(e); if(c) esconder(c); });
  document.addEventListener('focusout',  e => { const c = alvo(e); if(c) esconder(c); });
}
