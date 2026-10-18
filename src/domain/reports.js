import { DomainError } from './errors.js';
import { sum, hoje, fmtDate, somaDias, diasEntre } from './util.js';
export { somaDias, diasEntre };
import { prod, nomeProd, situacao, units, norm } from './queries.js';
import { TIPOS, PAGTOS } from './constants.js';
import { garantiaDaVenda, garantiaDoFornecedor } from './garantia.js';

/* ---------- períodos ---------- */

const iso = d => d.toISOString().slice(0, 10);
const paraData = s => new Date(s + 'T00:00:00Z');

const ultimoDia = mes => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };

/** Intervalo [inicio, fim] (datas ISO, inclusivo) do período; null = sem limite. `ref` é "hoje". */
export function intervalo(periodo, ref = hoje()){
  const mes = ref.slice(0, 7);
  switch(periodo){
    case 'hoje':   return [ref, ref];
    case '7d':     return [somaDias(ref, -6), ref];
    case 'mes':    return [mes + '-01', ultimoDia(mes)];
    case 'mesAnt': { const d = paraData(mes + '-01'); d.setUTCMonth(d.getUTCMonth() - 1); const m = iso(d).slice(0, 7); return [m + '-01', ultimoDia(m)]; }
    default:       return null;
  }
}

/** Está no período? `tudo` aceita tudo. */
export function noPeriodo(m, periodo, ref = hoje()){
  const r = intervalo(periodo, ref);
  if(!r) return true;
  const d = (m.data || '').slice(0, 10);
  return d >= r[0] && d <= r[1];
}

/* ---------- resumo (alertas de estoque) ---------- */

export function resumo(db, periodo, ref = hoje()){
  const vendas = db.moves.filter(m => m.tipo==='venda' && !m.cancelada && noPeriodo(m, periodo, ref));
  const baixas = db.moves.filter(m => m.tipo==='baixa' && noPeriodo(m, periodo, ref));
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

/* ---------- balanço ---------- */

const ordemPagto = f => { const i = PAGTOS.indexOf(f); return i < 0 ? PAGTOS.length : i; };

/** Soma por chave e devolve [{chave, qtd, valor}] do maior para o menor valor. */
function agrupar(itens, chave, valor, qtd = () => 1){
  const mapa = new Map();
  for(const it of itens){
    const k = chave(it), a = mapa.get(k) || {chave:k, qtd:0, valor:0};
    a.qtd += qtd(it); a.valor += valor(it); mapa.set(k, a);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/**
 * Três visões separadas:
 *  - lucro:  vendas - custo dos aparelhos vendidos - perdas - despesas
 *  - caixa:  o que entrou (vendas) - o que saiu (compras de produto + despesas)
 *  - estoque: dinheiro parado nos aparelhos que ainda não foram vendidos (hoje, não depende do período)
 */
export function balanco(db, periodo, ref = hoje()){
  const no = m => noPeriodo(m, periodo, ref);
  const vendas = db.moves.filter(m => m.tipo==='venda' && !m.cancelada && no(m));
  const baixas = db.moves.filter(m => m.tipo==='baixa' && no(m));
  const devolucoes = db.moves.filter(m => m.tipo==='devolucao' && no(m));
  const despesas = db.moves.filter(m => m.tipo==='despesa' && no(m));
  const entradas = db.moves.filter(m => m.tipo==='entrada' && no(m));

  const receita = sum(vendas, 'valor'), custoVendido = sum(vendas, 'custo');
  const lucroBruto = receita - custoVendido;
  const perdas = sum(baixas, 'valor'), gastos = sum(despesas, 'valor'), compras = sum(entradas, 'valor');
  const lucroLiquido = lucroBruto - perdas - gastos;

  // Caixa: venda a receber só entra quando a parcela é recebida; compra a pagar só sai quando é paga.
  const pagas = (db.bills || []).filter(b => b.status === 'pago' && no({data:b.dataPagamento}));
  const vendaViva = id => db.moves.some(m => m.id === id && m.tipo === 'venda' && !m.cancelada);
  // O que entrou na venda à vista é o valor original; a devolução sai à parte, na data em que aconteceu.
  const vendasAVista = vendas.filter(v => !v.aReceber).reduce((t, v) => t + v.valor + (v.devolvido?.reembolso || 0), 0);
  const reembolsos = sum(devolucoes, 'reembolso');
  const recebimentos = sum(pagas.filter(b => b.tipo === 'receber' && vendaViva(b.moveId)), 'valor');
  const comprasAVista = sum(entradas.filter(e => !e.aPagar), 'valor');
  const comprasPagas = comprasAVista + sum(pagas.filter(b => b.tipo === 'pagar' && b.origem === 'entrada'), 'valor');
  const entrou = vendasAVista + recebimentos, saiu = comprasPagas + gastos + reembolsos;
  const pendentes = (db.bills || []).filter(b => b.status === 'pendente');
  const emAberto = tipo => sum(pendentes.filter(b => b.tipo === tipo), 'valor');
  const vencido = tipo => sum(pendentes.filter(b => b.tipo === tipo && b.vencimento < ref), 'valor');

  const porPagamento = agrupar(vendas, v => v.pagamento || 'Não informado', v => v.valor)
    .map(a => ({forma:a.chave, qtd:a.qtd, valor:a.valor, pct: receita ? a.valor / receita * 100 : 0}))
    .sort((a, b) => ordemPagto(a.forma) - ordemPagto(b.forma) || b.valor - a.valor);

  const porCategoria = agrupar(despesas, d => d.categoria, d => d.valor).map(a => ({categoria:a.chave, valor:a.valor}));
  if(compras) porCategoria.push({categoria:'Produto (compras)', valor:compras});
  porCategoria.sort((a, b) => b.valor - a.valor);

  return {
    vendasQtd: vendas.filter(v => v.qty > 0).length, reembolsos, receita, custoVendido, lucroBruto, perdas, despesas: gastos, lucroLiquido,
    margemLiquida: receita ? lucroLiquido / receita * 100 : 0,
    compras, comprasPagas, vendasAVista, recebimentos,
    caixaEntrou: entrou, caixaSaiu: saiu, saldo: entrou - saiu,
    aReceber: emAberto('receber'), aPagar: emAberto('pagar'), vencidoReceber: vencido('receber'), vencidoPagar: vencido('pagar'),
    dinheiroParado: sum(db.units.filter(u => u.status === 'disponivel'), 'custo'),
    porPagamento, porCategoria, listaDespesas: despesas.slice().sort((a, b) => b.ts - a.ts),
  };
}

/* ---------- busca global ---------- */

export const BUSCA_MIN = 2;

/**
 * Busca em produtos (nome, variante, marca), clientes (nome, telefone), fornecedores (nome) e números de série.
 * Devolve até `limite` itens por grupo, nessa ordem: [{tipo, id, titulo, sub}].
 */
export function buscar(db, texto, limite = 6){
  const q = norm(texto);
  if(q.length < BUSCA_MIN) return [];
  const tem = (...campos) => campos.some(c => norm(c).includes(q));
  const digitos = q.replace(/\D/g, '');
  const fone = t => digitos.length >= BUSCA_MIN && String(t ?? '').replace(/\D/g, '').includes(digitos);
  const grupo = (lista, f) => lista.filter(f).slice(0, limite);
  const produtos = grupo(db.products, p => tem(p.nome, p.variante, p.marca))
    .map(p => ({tipo:'produto', id:p.id, titulo:nomeProd(p), sub:`${p.marca ? p.marca + ' · ' : ''}Estoque: ${units(db, p.id).length}`}));
  const clientes = grupo(db.customers || [], c => tem(c.nome, c.telefone) || fone(c.telefone))
    .map(c => ({tipo:'cliente', id:c.id, titulo:c.nome, sub:c.telefone || 'Cliente'}));
  const fornecedores = grupo(db.suppliers || [], f => tem(f.nome))
    .map(f => ({tipo:'fornecedor', id:f.id, titulo:f.nome, sub:'Fornecedor'}));
  const series = grupo(db.units.filter(u => u.serial), u => tem(u.serial))
    .map(u => ({tipo:'serie', id:u.id, serial:u.serial, titulo:`Série ${u.serial}`,
      sub:`${nomeProd(prod(db, u.productId))} · ${u.status === 'disponivel' ? 'em estoque' : u.status === 'vendido' ? 'vendida' : 'baixada'}`}));
  return [...produtos, ...clientes, ...fornecedores, ...series];
}

/* ---------- primeiros passos ---------- */

/** Roteiro para quem está começando: cada passo diz se já foi feito e em qual aba fazer. O último é opcional. */
export function primeirosPassos(db){
  const tem = tipo => db.moves.some(m => m.tipo === tipo && !m.cancelada);
  const passos = [
    {id:'fornecedor', texto:'Cadastre o fornecedor', dica:'Quem vende os aparelhos para você.', aba:'fornecedores', feito:db.suppliers.length > 0},
    {id:'produto', texto:'Cadastre os produtos', dica:'Importe o catálogo ou crie um a um, com preço, custo e estoque mínimo.', aba:'produtos', feito:db.products.length > 0},
    {id:'entrada', texto:'Registre a primeira compra', dica:'Com o número de série de cada aparelho, o custo e a garantia do fornecedor.', aba:'entradas', feito:tem('entrada')},
    {id:'venda', texto:'Registre a primeira venda', dica:'Informe cliente, forma de pagamento e garantia.', aba:'vendas', feito:tem('venda')},
    {id:'meta', texto:'Defina a meta do mês (opcional)', dica:'No Painel, em "Definir metas".', aba:'painel', feito:(db.metas || []).length > 0, opcional:true},
  ];
  return {passos, completo: passos.filter(p => !p.opcional).every(p => p.feito)};
}

/* ---------- conferência de caixa ---------- */

/**
 * Compara o dinheiro que você tem de verdade com o saldo do caixa do sistema (desde o início).
 * `inicial` é o dinheiro que você já tinha antes de começar a usar o sistema: ele não é registrado em lugar nenhum.
 */
export function conferirCaixa(db, {real, inicial = ''}, ref = hoje()){
  const num = (v, nome, obrigatorio) => {
    const t = String(v ?? '').trim().replace(',', '.');
    if(t === '') { if(obrigatorio) throw new DomainError(`Informe ${nome}.`); return 0; }
    const n = parseFloat(t);
    if(isNaN(n)) throw new DomainError(`Valor inválido em ${nome}.`);
    return n;
  };
  const dinheiro = num(real, 'quanto dinheiro você tem hoje', true), base = num(inicial, 'o dinheiro que você tinha ao começar', false);
  const sistema = balanco(db, 'tudo', ref).saldo;
  const esperado = Math.round((base + sistema) * 100) / 100, diferenca = Math.round((dinheiro - esperado) * 100) / 100;
  return {sistema, inicial: base, esperado, real: dinheiro, diferenca, situacao: diferenca === 0 ? 'bate' : diferenca > 0 ? 'sobra' : 'falta'};
}

/* ---------- metas do mês ---------- */

/**
 * Andamento das metas do mês de `ref`. Sem meta própria no mês, vale a do último mês que teve uma (`herdada`).
 * Realizado: receita das vendas e lucro líquido do mês (mesmos números do Balanço).
 */
export function progressoMetas(db, ref = hoje()){
  const mes = ref.slice(0, 7);
  const meta = (db.metas || []).filter(m => m.mes <= mes).sort((a, b) => b.mes.localeCompare(a.mes))[0] || null;
  const b = balanco(db, 'mes', ref);
  const item = (alvo, feito) => ({alvo, feito, pct: alvo > 0 ? feito / alvo * 100 : 0, falta: Math.max(alvo - feito, 0)});
  return {
    mes, meta: !!meta, herdada: !!meta && meta.mes !== mes,
    vendas: meta && meta.vendas > 0 ? item(meta.vendas, b.receita) : null,
    lucro: meta && meta.lucro > 0 ? item(meta.lucro, b.lucroLiquido) : null,
    diasRestantes: diasEntre(ref, ultimoDia(mes)),
    valores: meta ? {vendas: meta.vendas, lucro: meta.lucro} : {vendas: 0, lucro: 0},
  };
}

/* ---------- contas a receber e a pagar ---------- */

/** 'pago' | 'vencida' | 'hoje' | 'aVencer' (contas canceladas não entram nas listas). */
export const situacaoConta = (b, ref = hoje()) =>
  b.status === 'pago' ? 'pago' : b.vencimento < ref ? 'vencida' : b.vencimento === ref ? 'hoje' : 'aVencer';

/**
 * Contas ordenadas por vencimento. `tipo`: 'receber' | 'pagar' | 'todas'; `status`: 'pendentes' | 'pagas' | 'todas'.
 * Também devolve os totais em aberto, vencidos e dos próximos 7 dias.
 */
export function contas(db, {tipo = 'todas', status = 'pendentes'} = {}, ref = hoje()){
  const todas = (db.bills || []).filter(b => b.status !== 'cancelada');
  const lista = todas
    .filter(b => (tipo === 'todas' || b.tipo === tipo) && (status === 'todas' || (status === 'pagas' ? b.status === 'pago' : b.status === 'pendente')))
    .map(b => ({...b, situacao: situacaoConta(b, ref)}))
    .sort((a, b) => status === 'pagas' ? b.dataPagamento.localeCompare(a.dataPagamento) : a.vencimento.localeCompare(b.vencimento) || a.ts - b.ts);
  const pend = todas.filter(b => b.status === 'pendente'), fim7 = somaDias(ref, 7);
  const tot = (t, f = () => true) => sum(pend.filter(b => b.tipo === t && f(b)), 'valor');
  return {
    lista,
    receber: tot('receber'), pagar: tot('pagar'),
    vencidoReceber: tot('receber', b => b.vencimento < ref), vencidoPagar: tot('pagar', b => b.vencimento < ref),
    receber7: tot('receber', b => b.vencimento >= ref && b.vencimento <= fim7),
    pagar7: tot('pagar', b => b.vencimento >= ref && b.vencimento <= fim7),
    qtdVencidas: pend.filter(b => b.vencimento < ref).length,
  };
}

/* ---------- estatísticas de venda ---------- */

/** Dias do período até hoje; em "tudo", do primeiro movimento até hoje. */
function dias(db, periodo, ref){
  let r = intervalo(periodo, ref);
  if(!r){
    const datas = db.moves.filter(m => m.tipo === 'venda').map(m => m.data).sort();
    if(!datas.length) return [];
    r = [datas[0], ref];
  }
  const fim = r[1] < ref ? r[1] : ref;
  const out = [];
  for(let d = r[0]; d <= fim; d = somaDias(d, 1)) out.push(d);
  return out;
}

/** Série de vendas: diária, ou mensal quando o intervalo passa de 62 dias. */
export function serieVendas(db, periodo, ref = hoje()){
  const vendas = db.moves.filter(m => m.tipo==='venda' && !m.cancelada && noPeriodo(m, periodo, ref));
  const lista = dias(db, periodo, ref);
  const mensal = lista.length > 62;
  const chave = d => mensal ? d.slice(0, 7) : d;
  const rotulo = k => mensal ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const mapa = new Map();
  for(const d of lista){ const k = chave(d); if(!mapa.has(k)) mapa.set(k, {chave:k, rotulo:rotulo(k), receita:0, lucro:0, qtd:0}); }
  for(const v of vendas){
    const a = mapa.get(chave(v.data));
    if(a){ a.receita += v.valor; a.lucro += v.lucro || 0; a.qtd += v.qty; }
  }
  return {mensal, pontos:[...mapa.values()]};
}

export function topProdutos(db, periodo, ref = hoje(), limite = 6){
  const vendas = db.moves.filter(m => m.tipo==='venda' && !m.cancelada && noPeriodo(m, periodo, ref));
  const por = new Map();
  for(const v of vendas){
    const a = por.get(v.productId) || {id:v.productId, qtd:0, receita:0, lucro:0};
    a.qtd += v.qty; a.receita += v.valor; a.lucro += v.lucro || 0; por.set(v.productId, a);
  }
  return [...por.values()].sort((a, b) => b.lucro - a.lucro).slice(0, limite)
    .map(a => ({...a, nome: nomeProd(prod(db, a.id)), margem: a.receita ? a.lucro / a.receita * 100 : 0}));
}

/** Modelos com estoque, do que está parado há mais tempo (desde a entrada da unidade mais antiga). */
export function estoqueMaisAntigo(db, ref = hoje(), limite = 5){
  return db.products
    .map(p => {
      const disp = units(db, p.id);
      if(!disp.length) return null;
      const antiga = disp.map(u => u.dataEntrada).sort()[0];
      return {id:p.id, nome:nomeProd(p), qtd:disp.length, dias:Math.max(0, diasEntre(antiga, ref))};
    })
    .filter(Boolean).sort((a, b) => b.dias - a.dias).slice(0, limite);
}

/* ---------- clientes e fornecedores ---------- */

const vendasAtivas = db => db.moves.filter(m => m.tipo === 'venda' && !m.cancelada);
/** A venda é deste cliente se tem o id dele, ou (vendas antigas) o mesmo nome em texto. */
const ehDoCliente = c => m => m.customerId === c.id || (!m.customerId && norm(m.cliente) !== '' && norm(m.cliente) === norm(c.nome));
const ehDoFornecedor = f => m => m.supplierId === f.id || (!m.supplierId && norm(m.fornecedor) !== '' && norm(m.fornecedor) === norm(f.nome));
const maisRecentePrimeiro = (a, b) => b.data.localeCompare(a.data) || b.ts - a.ts;

export const comprasDoCliente = (db, c) => vendasAtivas(db).filter(ehDoCliente(c)).sort(maisRecentePrimeiro);

export function resumoClientes(db){
  return (db.customers || []).map(c => {
    const v = comprasDoCliente(db, c), total = sum(v, 'valor');
    return {...c, compras:v.length, unidades:sum(v, 'qty'), total, ticket: v.length ? total / v.length : 0, ultima: v[0]?.data || ''};
  }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export function resumoFornecedores(db){
  const entradas = db.moves.filter(m => m.tipo === 'entrada');
  return (db.suppliers || []).map(f => {
    const e = entradas.filter(ehDoFornecedor(f)).sort(maisRecentePrimeiro);
    return {...f, entradas:e.length, unidades:sum(e, 'qty'), total:sum(e, 'valor'), ultima: e[0]?.data || ''};
  }).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

/** Quem mais comprou no período (só vendas com cliente informado). */
export function topClientes(db, periodo, ref = hoje(), limite = 5){
  const por = new Map();
  for(const v of vendasAtivas(db).filter(m => noPeriodo(m, periodo, ref))){
    const cad = (db.customers || []).find(c => c.id === v.customerId);
    const nome = cad?.nome || v.cliente;
    if(norm(nome) === '') continue;
    const chave = cad ? cad.id : norm(nome), a = por.get(chave) || {nome, compras:0, total:0};
    a.compras += 1; a.total += v.valor; por.set(chave, a);
  }
  return [...por.values()].sort((a, b) => b.total - a.total).slice(0, limite);
}

/* ---------- garantias ---------- */

const soDigitos = s => String(s ?? '').replace(/\D/g, '');

/**
 * Procura vendas (não canceladas) pelo número de série, pelo nome do cliente ou pelo telefone dele,
 * e diz se a garantia ainda vale. Mais recentes primeiro. Busca com menos de 2 caracteres não devolve nada.
 */
export function consultarGarantia(db, termo, ref = hoje()){
  const t = norm(termo), d = soDigitos(termo);
  if(t.length < 2) return [];
  return db.moves
    .filter(m => m.tipo === 'venda' && !m.cancelada)
    .filter(m => {
      const cli = (db.customers || []).find(c => c.id === m.customerId);
      return (m.serials || []).some(x => norm(x).includes(t))
        || norm(m.cliente).includes(t) || norm(cli?.nome).includes(t)
        || (d.length >= 4 && soDigitos(cli?.telefone).includes(d));
    })
    .sort(maisRecentePrimeiro)
    .map(m => ({
      id:m.id, data:m.data, produto:nomeProd(prod(db, m.productId)), cliente:m.cliente, serials:m.serials || [],
      qty:m.qty, valor:m.valor, garantia:garantiaDaVenda(m, ref),
    }));
}

/**
 * Modelos com aparelhos em estoque cuja garantia do fornecedor termina nos próximos `dias` dias:
 * a hora de testar e devolver os defeituosos.
 */
export function garantiasVencendo(db, ref = hoje(), dias = 15){
  const por = new Map();
  for(const u of db.units.filter(x => x.status === 'disponivel')){
    const g = garantiaDoFornecedor(u, ref);
    if(g.situacao !== 'ativa' || g.dias > dias) continue;
    const a = por.get(u.productId) || {id:u.productId, nome:nomeProd(prod(db, u.productId)), qtd:0, ate:g.ate, dias:g.dias, estimada:false};
    a.qtd += 1; a.estimada ||= g.estimada;
    if(g.ate < a.ate){ a.ate = g.ate; a.dias = g.dias; }
    por.set(u.productId, a);
  }
  return [...por.values()].sort((a, b) => a.dias - b.dias);
}

/* ---------- exportação ---------- */

export function expText(db, fmt){
  if(fmt === 'json') return JSON.stringify(db, null, 2);
  const cell = v => String(v ?? '').replace(/[;\n\r]+/g,' ');
  const n = v => (Number(v)||0).toFixed(2).replace('.',',');
  const head = 'Data;Tipo;Produto;Quantidade;Valor;Custo;Lucro;Cliente ou fornecedor;Pagamento ou motivo;Séries;Cancelada;Observações';
  const rows = db.moves.slice().sort((a,b)=>a.ts-b.ts).map(m => {
    const nome = m.tipo === 'despesa' ? m.categoria : nomeProd(prod(db, m.productId));
    return [fmtDate(m.data), TIPOS[m.tipo]||m.tipo, nome, m.qty ?? '', n(m.valor), m.custo!=null?n(m.custo):'',
      m.lucro!=null?n(m.lucro):'', cell(m.cliente||m.fornecedor), cell(m.pagamento||m.motivo),
      cell((m.serials||[]).join(', ')), m.cancelada?'Sim':'Não', cell(m.obs)].join(';');
  });
  return [head, ...rows].join('\n');
}
