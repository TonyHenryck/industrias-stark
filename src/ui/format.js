export { fmtDate } from '../domain/util.js';

export const $ = s => document.querySelector(s);
export const brl = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const nf = (n,d=0) => (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const opt = (v,l,cur) => `<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(l)}</option>`;
export const badge = (txt, cls='') => `<span class="badge ${cls}">${esc(txt)}</span>`;
