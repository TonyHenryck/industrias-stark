import { esc, brl, opt, badge, fmtDate } from '../format.js';
import { prod, nomeProd } from '../../domain/queries.js';
import { TIPOS } from '../../domain/constants.js';
import { prodOpts } from '../shared.js';

export function histRows({db, fHist}){
  const q = fHist.q.trim().toLowerCase();
  const list = db.moves.slice().sort((a,b)=>b.ts-a.ts).filter(m =>
    (!fHist.tipo || m.tipo===fHist.tipo) &&
    (!fHist.pid || m.productId===fHist.pid) &&
    (!q || JSON.stringify([m.cliente,m.fornecedor,m.motivo,m.serials,m.obs]).toLowerCase().includes(q)));
  if(!list.length) return '<p class="empty">Nada encontrado.</p>';
  return `<div class="tbl"><table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th class="r">Qtd</th><th class="r">Valor</th><th>Detalhes</th><th></th></tr></thead>
    <tbody>${list.map(m => {
      const det = [m.cliente, m.fornecedor, m.motivo, m.pagamento, (m.serials||[]).length ? 'Séries: '+m.serials.join(', ') : '', m.obs]
        .filter(Boolean).join(' · ');
      const tipoCls = m.tipo==='baixa' || m.tipo==='despesa' ? 'bad' : m.tipo==='entrada' ? 'ok' : '';
      const acao = m.tipo==='venda' && !m.cancelada ? `<button class="btn small" data-act="cancelVenda" data-id="${m.id}">Cancelar venda</button>` : (m.cancelada ? badge('Cancelada','bad') : '');
      return `<tr><td>${fmtDate(m.data)}</td><td>${badge(TIPOS[m.tipo]||m.tipo, tipoCls)}</td><td>${esc(m.tipo==='despesa' ? m.categoria : nomeProd(prod(db, m.productId)))}</td>
        <td class="r">${m.qty ?? ''}</td><td class="r">${brl(m.valor)}</td><td style="white-space:normal;min-width:180px">${esc(det)}</td><td>${acao}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export default s => {
  const {db, fHist} = s;
  return `
  <section class="card">
    <h2>Histórico de movimentações</h2>
    <div class="filters">
      <select data-f="h" data-k="tipo"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k,l])=>opt(k,l,fHist.tipo)).join('')}</select>
      <select data-f="h" data-k="pid"><option value="">Todos os produtos</option>${prodOpts(db, fHist.pid)}</select>
      <input data-f="h" data-k="q" type="search" placeholder="Buscar cliente, fornecedor, série…" value="${esc(fHist.q)}">
    </div>
    <div id="hTbl">${histRows(s)}</div>
  </section>`;
};
