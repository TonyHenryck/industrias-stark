import { emptyDb } from '../domain/queries.js';
import { diffRows } from './diff.js';

const TABLES = ['products', 'units', 'moves', 'customers', 'suppliers'];
/** Tabelas da etapa 2: se ainda não existem no Supabase, o app abre sem elas em vez de quebrar. */
const OPCIONAIS = ['customers', 'suppliers'];
const tabelaAusente = e => /PGRST205|42P01|schema cache|does not exist/i.test(`${e?.code} ${e?.message}`);
const PAGE = 1000, CHUNK = 500;

const check = ({error}) => { if(error) throw error; };
const chunks = (arr, n) => Array.from({length: Math.ceil(arr.length/n)}, (_, i) => arr.slice(i*n, (i+1)*n));

/** Armazenamento no Supabase. `client` é o resultado de createClient(). */
export function createRemote(client){
  let snap = Object.fromEntries(TABLES.map(t => [t, new Map()]));
  const ausentes = new Set();

  async function fetchAll(table){
    const rows = [];
    for(let from = 0; ; from += PAGE){
      const {data, error} = await client.from(table).select('id,data').order('id').range(from, from + PAGE - 1);
      if(error) throw error;
      rows.push(...data);
      if(data.length < PAGE) return rows;
    }
  }

  async function load(){
    const db = emptyDb(), novo = {};
    ausentes.clear();
    for(const t of TABLES){
      let rows = [];
      try{ rows = await fetchAll(t); }
      catch(e){ if(OPCIONAIS.includes(t) && tabelaAusente(e)) ausentes.add(t); else throw e; }
      db[t] = rows.map(r => r.data);
      novo[t] = new Map(rows.map(r => [r.id, JSON.stringify(r.data)]));
    }
    snap = novo;
    return db;
  }

  async function save(db){
    for(const t of TABLES){
      const {upserts, deletes} = diffRows(snap[t], db[t] || []);
      if(ausentes.has(t)){
        if(upserts.length || deletes.length)
          throw new Error(`A tabela "${t}" ainda não existe no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor e tente de novo.`);
        continue;
      }
      for(const c of chunks(upserts, CHUNK)) check(await client.from(t).upsert(c, {onConflict:'id'}));
      for(const c of chunks(deletes, CHUNK)) check(await client.from(t).delete().in('id', c));
      upserts.forEach(r => snap[t].set(r.id, JSON.stringify(r.data)));
      deletes.forEach(id => snap[t].delete(id));
    }
  }

  /** Chama `cb` quando outra pessoa altera algo. Devolve a função que cancela. */
  function subscribe(cb){
    let timer;
    const ch = client.channel('estoque');
    for(const t of TABLES.filter(x => !ausentes.has(x)))
      ch.on('postgres_changes', {event:'*', schema:'public', table:t}, () => { clearTimeout(timer); timer = setTimeout(cb, 400); });
    ch.subscribe();
    return () => client.removeChannel(ch);
  }

  const auth = {
    async user(){ const {data} = await client.auth.getSession(); return data.session?.user ?? null; },
    async signIn(email, password){ check(await client.auth.signInWithPassword({email, password})); },
    async signOut(){ await client.auth.signOut(); },
    /** O usuário logado está na tabela members? Sem isso o banco devolve vazio e recusa gravações. */
    async isMember(){ const {data, error} = await client.rpc('is_member'); if(error) throw error; return data === true; },
    // O supabase-js chama este aviso segurando o bloqueio interno de autenticação. Consultar o banco
    // de dentro dele trava para sempre, então o aviso é adiado para depois que o bloqueio for solto.
    onChange(cb){ client.auth.onAuthStateChange((_, session) => { setTimeout(() => cb(session?.user ?? null), 0); }); },
  };

  return {kind:'remote', load, save, subscribe, auth};
}
