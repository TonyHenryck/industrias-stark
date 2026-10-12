export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
export const str = v => String(v ?? '');
export const sum = (arr,k) => arr.reduce((s,m) => s + (m[k]||0), 0);
export const parseSeriais = s => str(s).split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);

export const hoje = () => {
  const d = new Date(), z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
};
export const fmtDate = iso => {
  if(!iso) return '';
  const [y,m,d] = iso.slice(0,10).split('-');
  return `${d}/${m}/${y}`;
};

/** Ordem FIFO: data de entrada, depois ordem de cadastro. */
export const sortUnits = arr => arr.slice().sort((a,b) =>
  a.dataEntrada < b.dataEntrada ? -1 : a.dataEntrada > b.dataEntrada ? 1 : (a.ts||0)-(b.ts||0));

export const arred = n => Math.round(n * 100) / 100;
export const dataValida = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z'));

/** Soma meses mantendo o dia; se o mês de destino for mais curto, usa o último dia (31/01 + 1 mês = 28/02). */
export const somaMeses = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number), t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = t % 12, ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
};
