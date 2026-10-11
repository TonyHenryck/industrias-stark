import { esc, badge } from './format.js';
import { stock, nomeProd } from '../domain/queries.js';

export const prodOpts = (db, sel, comEstoque) => db.products.map(p =>
  `<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(nomeProd(p))}${comEstoque?` (estoque: ${stock(db, p.id)})`:''}</option>`).join('');

export const badgeUnit = st => ({disponivel:badge('Disponível','ok'), vendido:badge('Vendido'), baixa:badge('Baixado','bad')})[st] || badge(st);
