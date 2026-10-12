import { sum } from './util.js';

export const emptyDb = () => ({products:[], units:[], moves:[], customers:[], suppliers:[]});
export const isDb = d => !!d && Array.isArray(d.products) && Array.isArray(d.units) && Array.isArray(d.moves);

/** Bancos e backups antigos não têm clientes nem fornecedores: completa o que faltar. */
export const normalizar = d => { d.customers ??= []; d.suppliers ??= []; return d; };

export const norm = s => String(s ?? '').trim().toLowerCase();
/** Acha um cadastro pelo nome (sem diferenciar maiúsculas); usado para ligar vendas e entradas. */
export const acharPorNome = (lista, nome) => (norm(nome) ? (lista || []).find(x => norm(x.nome) === norm(nome)) : undefined);

export const prod = (db, id) => db.products.find(p => p.id === id);
export const units = (db, pid, st='disponivel') => db.units.filter(u => u.productId === pid && u.status === st);
export const stock = (db, pid) => units(db, pid).length;
export const avgCost = (db, pid) => { const a = units(db, pid); return a.length ? sum(a,'custo')/a.length : 0; };
export const nomeProd = p => p ? [p.nome, p.variante].filter(Boolean).join(' · ') : '(removido)';

/**
 * [classe, rótulo] da situação de estoque de um produto.
 * Produto que nunca recebeu entrada (ex.: recém-importado do catálogo) não é alerta.
 */
export const situacao = (db, p) => {
  const s = stock(db, p.id);
  if(s === 0) return db.units.some(u => u.productId === p.id) ? ['bad','Zerado'] : ['','Sem entradas'];
  if(p.minimo && s <= p.minimo) return ['warn','Baixo'];
  return ['ok','OK'];
};
