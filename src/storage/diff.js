/**
 * Compara o que o servidor tem (`snap`: Map id -> JSON) com a lista atual.
 * Devolve só as linhas que mudaram, para não regravar tudo a cada operação.
 */
export function diffRows(snap, items){
  const upserts = [], vistos = new Set();
  for(const it of items){
    vistos.add(it.id);
    if(snap.get(it.id) !== JSON.stringify(it)) upserts.push({id:it.id, data:it});
  }
  const deletes = [...snap.keys()].filter(id => !vistos.has(id));
  return {upserts, deletes};
}
