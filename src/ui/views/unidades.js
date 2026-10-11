import { esc, brl, opt, fmtDate } from '../format.js';
import { prod, nomeProd } from '../../domain/queries.js';
import { sortUnits } from '../../domain/util.js';
import { prodOpts, badgeUnit } from '../shared.js';

export function unidadesRows({db, fUnit}){
  const q = fUnit.q.trim().toLowerCase();
  const list = sortUnits(db.units).filter(u =>
    (fUnit.st==='todos' || u.status===fUnit.st) &&
    (!fUnit.pid || u.productId===fUnit.pid) &&
    (!q || (u.serial||'').toLowerCase().includes(q)));
  if(!list.length) return '<p class="empty">Nenhuma unidade encontrada.</p>';
  return `<div class="tbl"><table>
    <thead><tr><th>Série</th><th>Produto</th><th>Status</th><th class="r">Custo</th><th>Entrada</th><th>Saída</th></tr></thead>
    <tbody>${list.map(u => `<tr><td class="mono">${esc(u.serial||'sem série')}</td><td>${esc(nomeProd(prod(db, u.productId)))}</td>
      <td>${badgeUnit(u.status)}</td><td class="r">${brl(u.custo)}</td><td>${fmtDate(u.dataEntrada)}</td><td>${fmtDate(u.dataSaida)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

export default s => {
  const {db, fUnit} = s;
  return `
  <section class="card">
    <h2>Unidades</h2>
    <p class="hint">Cada aparelho é controlado separadamente. Vendas e baixas usam primeiro as unidades mais antigas, a menos que você informe as séries.</p>
    <div class="filters">
      <select data-f="u" data-k="st">${opt('disponivel','Disponíveis',fUnit.st)}${opt('vendido','Vendidos',fUnit.st)}${opt('baixa','Baixados',fUnit.st)}${opt('todos','Todos',fUnit.st)}</select>
      <select data-f="u" data-k="pid"><option value="">Todos os produtos</option>${prodOpts(db, fUnit.pid)}</select>
      <input data-f="u" data-k="q" type="search" placeholder="Buscar número de série" value="${esc(fUnit.q)}">
    </div>
    <div id="uTbl">${unidadesRows(s)}</div>
  </section>`;
};
