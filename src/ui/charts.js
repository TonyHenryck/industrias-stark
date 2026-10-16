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

const COR_SERIE = ['var(--c1)', 'var(--c2)', 'var(--c3)'];

/**
 * Linhas no tempo para duas séries (ex.: receita e lucro). `series`: [{nome, valores[]}], `rotulos`: [] e `tips`: [] por ponto.
 * Legenda sempre presente (são duas séries); o último ponto de cada série leva o valor escrito.
 */
export function linhas({rotulos, series, tips, nome, formato = brl}){
  const n = rotulos.length;
  const maxV = Math.max(...series.flatMap(s => s.valores), 0);
  const minV = Math.min(...series.flatMap(s => s.valores), 0);
  const topo = maxBonito(maxV), base = minV < 0 ? -maxBonito(-minV) : 0, faixa = topo - base || 1;
  const x = i => n > 1 ? i / (n - 1) * 100 : 50;
  const y = v => 100 - (v - base) / faixa * 100;
  const caminho = s => s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
  const passo = Math.ceil(n / 6);
  const ticks = [topo, (topo + base) / 2, base].map(v => `<span style="bottom:${(v - base) / faixa * 100}%">${v ? compacto(v) : '0'}</span>`).join('');
  const eixo = rotulos.map((r, i) => `<span>${(n - 1 - i) % passo === 0 ? esc(r) : ''}</span>`).join('');
  const caminhos = series.map((s, k) => `<path class="viz-line" d="${caminho(s)}" style="stroke:${COR_SERIE[k]}"/>`).join('');
  const pontos = series.map((s, k) => {
    const i = n - 1;
    return `<span class="viz-dot" style="left:${x(i)}%;top:${y(s.valores[i])}%;background:${COR_SERIE[k]}"></span>
      <span class="viz-end" style="top:${y(s.valores[i])}%">${esc(formato(s.valores[i]))}</span>`;
  }).join('');
  const cols = rotulos.map((_, i) => `<button type="button" class="viz-col" data-tip="${esc(tips[i])}" aria-label="${esc(tips[i])}"></button>`).join('');
  const legenda = series.map((s, k) => `<span><i style="background:${COR_SERIE[k]}"></i>${esc(s.nome)}</span>`).join('');
  const cab = series.map(s => `<th class="r">${esc(s.nome)}</th>`).join('');
  const tab = rotulos.map((r, i) => `<tr><td>${esc(r)}</td>${series.map(s => `<td class="r">${esc(formato(s.valores[i]))}</td>`).join('')}</tr>`).join('');
  return `<div class="viz" data-viz>
    <div class="viz-legend">${legenda}</div>
    <div class="viz-plot" role="group" aria-label="${esc(nome)}">
      <div class="viz-y" aria-hidden="true">${ticks}</div>
      <div class="viz-body">
        <div class="viz-grid" aria-hidden="true"><i></i><i></i><i></i></div>
        <svg class="viz-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${caminhos}</svg>
        ${pontos}
        <div class="viz-cols">${cols}</div>
      </div>
    </div>
    <div class="viz-x" aria-hidden="true"><div class="viz-xs">${eixo}</div></div>
    <details class="viz-table"><summary>Ver como tabela</summary>
      <div class="tbl"><table><thead><tr><th>Período</th>${cab}</tr></thead><tbody>${tab}</tbody></table></div>
    </details>
    <div class="viz-tip" role="tooltip" hidden></div>
  </div>`;
}

/** Mini-gráfico de linha para dentro de um indicador. Só decora: o valor e a tabela estão no resto da página. */
export function sparkline(valores){
  if(valores.length < 2 || !valores.some(v => v > 0)) return '';
  const max = Math.max(...valores), min = Math.min(...valores), f = max - min || 1;
  const d = valores.map((v, i) => `${i ? 'L' : 'M'}${(i / (valores.length - 1) * 100).toFixed(1)} ${(26 - (v - min) / f * 22).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * Anel de progresso de uma meta. O percentual real aparece escrito (pode passar de 100%); o anel enche até 100%.
 * `cor`: valor CSS da cor do anel.
 */
export function anel({pct, titulo, feito, alvo, cor, falta}){
  const cheio = Math.min(Math.max(pct, 0), 100);
  return `<div class="anel">
    <div class="anel-ring" style="--p:${cheio.toFixed(1)}%;--cor:${cor}" role="img" aria-label="${esc(titulo)}: ${Math.round(pct)}% da meta">
      <div class="anel-hole"><strong>${Math.round(pct)}%</strong></div>
    </div>
    <div class="anel-txt"><b>${esc(titulo)}</b>
      <span>${esc(feito)} de ${esc(alvo)}</span>
      <small>${pct >= 100 ? 'Meta batida' : `Faltam ${esc(falta)}`}</small></div>
  </div>`;
}

/**
 * Rosca (parte do todo, até 6 fatias). `itens`: [{rotulo, valor, texto, sub?}]; `centro`: {rotulo, texto}.
 * A legenda traz o valor de cada fatia, então a cor nunca é a única informação.
 */
export function rosca(itens, centro){
  const total = itens.reduce((a, i) => a + i.valor, 0);
  if(!(total > 0)) return '';
  let ang = 0;
  const gap = itens.length > 1 ? 1.2 : 0;
  const stops = itens.map((it, k) => {
    const fim = ang + it.valor / total * 360;
    const t = `${COR_SERIE[k % 3]} ${ang + gap / 2}deg ${fim - gap / 2}deg, transparent ${fim - gap / 2}deg ${fim + gap / 2}deg`;
    ang = fim; return t;
  }).join(',');
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(from 0deg,${stops})" role="img" aria-label="${esc(centro.rotulo)}: ${esc(centro.texto)}">
      <div class="donut-hole"><strong>${esc(centro.texto)}</strong><small>${esc(centro.rotulo)}</small></div>
    </div>
    <ul class="donut-leg">${itens.map((it, k) => `<li><i style="background:${COR_SERIE[k % 3]}"></i><span>${esc(it.rotulo)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><b>${esc(it.texto)}</b></li>`).join('')}</ul>
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
