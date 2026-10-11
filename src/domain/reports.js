import { sum, hoje, fmtDate } from './util.js';
import { prod, nomeProd, situacao } from './queries.js';
import { TIPOS } from './constants.js';

/** Está no período? `tudo` aceita tudo; `mes` só o mês corrente. */
export const noPeriodo = (m, periodo) => periodo === 'tudo' || (m.data||'').slice(0,7) === hoje().slice(0,7);

export function resumo(db, periodo){
  const vendas = db.moves.filter(m => m.tipo==='venda' && !m.cancelada && noPeriodo(m, periodo));
  const baixas = db.moves.filter(m => m.tipo==='baixa' && noPeriodo(m, periodo));
  const disp = db.units.filter(u => u.status==='disponivel');
  const receita = sum(vendas,'valor'), custo = sum(vendas,'custo'), lucro = receita - custo;
  return {
    vendas, baixas, disp,
    valorEstoque: sum(disp,'custo'),
    receita, custo, lucro,
    margem: receita ? lucro/receita*100 : 0,
    alertas: db.products.filter(p => ['bad','warn'].includes(situacao(db, p)[0])),
  };
}

export function expText(db, fmt){
  if(fmt === 'json') return JSON.stringify(db, null, 2);
  const cell = v => String(v ?? '').replace(/[;\n\r]+/g,' ');
  const n = v => (Number(v)||0).toFixed(2).replace('.',',');
  const head = 'Data;Tipo;Produto;Quantidade;Valor;Custo;Lucro;Cliente ou fornecedor;Pagamento ou motivo;Séries;Cancelada;Observações';
  const rows = db.moves.slice().sort((a,b)=>a.ts-b.ts).map(m => {
    const p = prod(db, m.productId);
    return [fmtDate(m.data), TIPOS[m.tipo]||m.tipo, nomeProd(p), m.qty, n(m.valor), m.custo!=null?n(m.custo):'',
      m.lucro!=null?n(m.lucro):'', cell(m.cliente||m.fornecedor), cell(m.pagamento||m.motivo),
      cell((m.serials||[]).join(', ')), m.cancelada?'Sim':'Não', cell(m.obs)].join(';');
  });
  return [head, ...rows].join('\n');
}
