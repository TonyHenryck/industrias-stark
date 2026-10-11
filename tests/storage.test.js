import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRows } from '../src/storage/diff.js';
import { createRemote } from '../src/storage/remote.js';
import { emptyDb } from '../src/domain/queries.js';
import { salvarProduto, addEntrada, addVenda } from '../src/domain/operations.js';

function fakeClient(){
  const tables = {products:new Map(), units:new Map(), moves:new Map()};
  const calls = [];
  return {tables, calls, from(t){ return {
    select(){ const q = {order(){ return q; },
      range(a,b){ const rows = [...tables[t].entries()].sort(([x],[y]) => x<y?-1:1).slice(a,b+1).map(([id,data]) => ({id,data}));
        return Promise.resolve({data:rows, error:null}); }}; return q; },
    upsert(rows){ calls.push(['upsert',t,rows.length]); rows.forEach(r => tables[t].set(r.id, r.data)); return Promise.resolve({error:null}); },
    delete(){ return {in(_, ids){ calls.push(['delete',t,ids.length]); ids.forEach(i => tables[t].delete(i)); return Promise.resolve({error:null}); }}; },
  };}};
}

test('diffRows separa novos, alterados, iguais e removidos', () => {
  const snap = new Map([['a', JSON.stringify({id:'a',v:1})], ['b', JSON.stringify({id:'b',v:1})], ['c', JSON.stringify({id:'c',v:1})]]);
  const {upserts, deletes} = diffRows(snap, [{id:'a',v:1}, {id:'b',v:2}, {id:'d',v:1}]);
  assert.deepEqual(upserts.map(r => r.id).sort(), ['b','d']);
  assert.deepEqual(deletes, ['c']);
});

test('remoto: grava só o que mudou e relê igual', async () => {
  const c = fakeClient(), store = createRemote(c);
  let db = await store.load();
  assert.deepEqual(db, emptyDb());

  salvarProduto(db, {nome:'Bip 5', custoPadrao:'200'});
  const p = db.products[0];
  addEntrada(db, {produto:p.id, qtd:'3', data:'2026-01-01'});
  await store.save(db);
  assert.equal(c.tables.units.size, 3);

  c.calls.length = 0;
  await store.save(db);
  assert.deepEqual(c.calls, [], 'sem mudanças, nada é enviado');

  addVenda(db, {produto:p.id, qtd:'1', preco:'400', data:'2026-02-01'});
  await store.save(db);
  assert.deepEqual(c.calls.map(x => x.join(':')).sort(), ['upsert:moves:1','upsert:units:1']);

  const porId = d => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.slice().sort((a, b) => a.id < b.id ? -1 : 1)]));
  assert.deepEqual(porId(await createRemote(c).load()), porId(db));
});

test('remoto: importar um backup menor remove o que sobrou no servidor', async () => {
  const c = fakeClient(), store = createRemote(c);
  const db = await store.load();
  salvarProduto(db, {nome:'A'}); salvarProduto(db, {nome:'B'});
  await store.save(db);
  await store.save({...emptyDb(), products:[db.products[0]]});
  assert.equal(c.tables.products.size, 1);
});

test('remoto: lê mais de uma página', async () => {
  const c = fakeClient();
  for(let i = 0; i < 2500; i++) c.tables.units.set('u' + String(i).padStart(5,'0'), {id:'u'+i});
  assert.equal((await createRemote(c).load()).units.length, 2500);
});

test('remoto: erro do servidor sobe como exceção', async () => {
  const c = fakeClient();
  c.from = () => ({upsert: () => Promise.resolve({error:new Error('RLS')}) });
  const store = createRemote(c);
  const db = emptyDb(); salvarProduto(db, {nome:'A'});
  await assert.rejects(store.save(db), /RLS/);
});
