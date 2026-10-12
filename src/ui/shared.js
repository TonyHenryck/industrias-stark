import { esc, badge, opt } from './format.js';
import { stock, nomeProd } from '../domain/queries.js';
import { PERIODOS } from '../domain/constants.js';

export const prodOpts = (db, sel, comEstoque) => db.products.map(p =>
  `<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(nomeProd(p))}${comEstoque?` (estoque: ${stock(db, p.id)})`:''}</option>`).join('');

export const badgeUnit = st => ({disponivel:badge('Disponível','ok'), vendido:badge('Vendido'), baixa:badge('Baixado','bad')})[st] || badge(st);

/** Seletor de período compartilhado pelo Painel e pelo Balanço. */
export const periodoSelect = periodo => `
  <div class="inline" style="margin-bottom:12px"><label class="inline">Período
    <select id="per">${PERIODOS.map(([k, l]) => opt(k, l, periodo)).join('')}</select></label></div>`;
