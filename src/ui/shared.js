import { esc, badge, opt, fmtDate } from './format.js';
import { stock, nomeProd } from '../domain/queries.js';
import { PERIODOS } from '../domain/constants.js';

export const prodOpts = (db, sel, comEstoque) => db.products.map(p =>
  `<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(nomeProd(p))}${comEstoque?` (estoque: ${stock(db, p.id)})`:''}</option>`).join('');

export const badgeUnit = st => ({disponivel:badge('Disponível','ok'), vendido:badge('Vendido'), baixa:badge('Baixado','bad')})[st] || badge(st);

/** Seletor de período compartilhado pelo Painel e pelo Balanço. */
export const periodoSelect = periodo => `
  <div class="inline" style="margin-bottom:12px"><label class="inline">Período
    <select id="per">${PERIODOS.map(([k, l]) => opt(k, l, periodo)).join('')}</select></label></div>`;

/** Lista de sugestões para um campo de texto (continua aceitando um nome novo). */
export const datalist = (id, itens) => `<datalist id="${id}">${(itens || []).map(i => `<option value="${esc(i.nome)}"></option>`).join('')}</datalist>`;

/** Selo de uma garantia ({situacao, ate, dias, estimada?}). */
export function badgeGarantia(g){
  if(!g) return '';
  const est = g.estimada ? ' (estimada)' : '';
  switch(g.situacao){
    case 'ativa':   return badge(g.dias === 0 ? `Vence hoje${est}` : `até ${fmtDate(g.ate)} · ${g.dias} dia(s)${est}`, g.dias <= 15 ? 'warn' : 'ok');
    case 'vencida': return badge(`Venceu em ${fmtDate(g.ate)}${est}`, 'bad');
    case 'sem':     return badge('Sem garantia');
    default:        return badge('Não registrada');
  }
}
