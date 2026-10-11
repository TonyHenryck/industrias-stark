import { sum } from './util.js';

export const emptyDb = () => ({products:[], units:[], moves:[]});
export const isDb = d => !!d && Array.isArray(d.products) && Array.isArray(d.units) && Array.isArray(d.moves);

export const prod = (db, id) => db.products.find(p => p.id === id);
export const units = (db, pid, st='disponivel') => db.units.filter(u => u.productId === pid && u.status === st);
export const stock = (db, pid) => units(db, pid).length;
export const avgCost = (db, pid) => { const a = units(db, pid); return a.length ? sum(a,'custo')/a.length : 0; };
export const nomeProd = p => p ? [p.nome, p.variante].filter(Boolean).join(' · ') : '(removido)';

/** [classe, rótulo] da situação de estoque de um produto. */
export const situacao = (db, p) => {
  const s = stock(db, p.id);
  if(s === 0) return ['bad','Zerado'];
  if(p.minimo && s <= p.minimo) return ['warn','Baixo'];
  return ['ok','OK'];
};
