import { emptyDb, isDb } from '../domain/queries.js';

export const KEY = 'estoque-smartwatch-v1';

function readLocal(){
  try{
    const s = localStorage.getItem(KEY);
    if(s){ const d = JSON.parse(s); if(isDb(d)) return d; }
  }catch(e){}
  return emptyDb();
}

/** Armazenamento no navegador (sem login, sem sincronização). */
export function createLocal(){
  return {
    kind: 'local',
    auth: null,
    async load(){ return readLocal(); },
    async save(db){ localStorage.setItem(KEY, JSON.stringify(db)); },
    subscribe(){ return () => {}; },
  };
}
