import { emptyDb, isDb } from '../domain/queries.js';

export const KEY = 'estoque-smartwatch-v1';

export function load(){
  try{
    const s = localStorage.getItem(KEY);
    if(s){ const d = JSON.parse(s); if(isDb(d)) return d; }
  }catch(e){}
  return emptyDb();
}

/** Devolve false se o navegador não deixou gravar. */
export function save(db){
  try{ localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch(e){ return false; }
}
