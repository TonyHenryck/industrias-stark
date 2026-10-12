/*
 * Regras de estoque. Cada função altera `db` e devolve a mensagem de sucesso,
 * ou lança DomainError (sem alterar nada) quando a operação é inválida.
 * Os dados de entrada são os valores crus dos formulários (strings).
 */
import { fail } from './errors.js';
import { uid, str, hoje, fmtDate, parseSeriais, sortUnits, arred, dataValida, somaMeses } from './util.js';
import { prod, units, nomeProd, isDb, normalizar, norm, acharPorNome } from './queries.js';
import { CATEGORIAS_DESPESA } from './constants.js';

const produtoOuFalha = (db, id) => prod(db, id) || fail('Escolha o produto.');

export function salvarProduto(db, f){
  const nome = str(f.nome).trim();
  if(!nome) fail('Informe o nome do modelo.');
  const dados = {
    nome, marca:str(f.marca).trim(), variante:str(f.variante).trim(),
    custoPadrao: parseFloat(f.custoPadrao)||0,
    precoPadrao: parseFloat(f.precoPadrao)||0,
    minimo: parseInt(f.minimo)||0,
    fornecedor: str(f.fornecedor).trim(), obs: str(f.obs).trim()
  };
  if(f.id){
    const p = prod(db, f.id) || fail('Produto não encontrado.');
    Object.assign(p, dados);
    return 'Produto atualizado.';
  }
  db.products.push({id:uid(), ...dados, criado:hoje()});
  return 'Produto cadastrado.';
}

const chaveProduto = p => [p.marca, p.nome, p.variante].map(x => str(x).trim().toLowerCase()).join('|');

/** Cadastra os itens que ainda não existem (mesma marca, modelo e variante). Não altera os que já existem. */
export function importarCatalogo(db, itens){
  const existentes = new Set(db.products.map(chaveProduto));
  let novos = 0;
  for(const it of itens){
    if(existentes.has(chaveProduto(it))) continue;
    existentes.add(chaveProduto(it));
    db.products.push({...it, id:uid(), criado:hoje()});
    novos++;
  }
  const jaExistiam = itens.length - novos;
  if(!novos) return 'Nenhum produto novo: todos já estavam cadastrados.';
  return `${novos} produto(s) importado(s)` + (jaExistiam ? `, ${jaExistiam} já existiam.` : '.');
}

/* ---------- clientes e fornecedores ---------- */

/** Cria ou atualiza um cadastro de `lista` (clientes ou fornecedores). Nome obrigatório e único. */
function salvarContato(lista, rotulo, campos, f){
  const nome = str(f.nome).trim();
  if(!nome) fail(`Informe o nome do ${rotulo}.`);
  const repetido = lista.find(x => norm(x.nome) === norm(nome) && x.id !== f.id);
  if(repetido) fail(`Já existe um ${rotulo} chamado "${repetido.nome}".`);
  const dados = {nome, ...Object.fromEntries(campos.map(c => [c, str(f[c]).trim()]))};
  if(f.id){
    const atual = lista.find(x => x.id === f.id) || fail(`${rotulo[0].toUpperCase() + rotulo.slice(1)} não encontrado.`);
    Object.assign(atual, dados);
    return `${rotulo[0].toUpperCase() + rotulo.slice(1)} atualizado.`;
  }
  lista.push({id:uid(), ...dados, criado:hoje()});
  return `${rotulo[0].toUpperCase() + rotulo.slice(1)} cadastrado.`;
}

export const salvarCliente = (db, f) => salvarContato(normalizar(db).customers, 'cliente', ['telefone', 'obs'], f);
export const salvarFornecedor = (db, f) => salvarContato(normalizar(db).suppliers, 'fornecedor',
  ['contato', 'site', 'pedidoMinimo', 'prazo', 'pagamento', 'obs'], f);

/** Excluir não apaga o histórico: vendas e entradas guardam o nome em texto. */
export function excluirCliente(db, id){
  normalizar(db);
  if(!db.customers.some(c => c.id === id)) return null;
  db.customers = db.customers.filter(c => c.id !== id);
  return 'Cliente excluído. O histórico de vendas continua com o nome dele.';
}
export function excluirFornecedor(db, id){
  normalizar(db);
  if(!db.suppliers.some(c => c.id === id)) return null;
  db.suppliers = db.suppliers.filter(c => c.id !== id);
  return 'Fornecedor excluído. O histórico de entradas continua com o nome dele.';
}

export const MAX_FOTOS = 3;

/** Guarda o caminho de uma foto já enviada. Devolve null se o produto já tem essa foto. */
export function adicionarFoto(db, productId, caminho){
  const p = prod(db, productId) || fail('Produto não encontrado.');
  p.fotos ??= [];
  if(p.fotos.includes(caminho)) return null;
  if(p.fotos.length >= MAX_FOTOS) fail(`Cada produto aceita até ${MAX_FOTOS} fotos. Remova uma para adicionar outra.`);
  p.fotos.push(caminho);
  return 'Foto adicionada.';
}

export function removerFoto(db, productId, caminho){
  const p = prod(db, productId);
  const i = p?.fotos?.indexOf(caminho) ?? -1;
  if(i < 0) return null;
  p.fotos.splice(i, 1);
  return 'Foto removida.';
}

export function excluirProduto(db, id){
  if(db.units.some(u => u.productId===id) || db.moves.some(m => m.productId===id))
    fail('Este produto já tem movimentações. Edite em vez de excluir.');
  db.products = db.products.filter(p => p.id !== id);
  return 'Produto excluído.';
}

/** Divide o valor em parcelas mensais (a última absorve o centavo que sobrar). Valida antes de qualquer gravação. */
function planoParcelas(valor, f){
  const n = f.parcelas === undefined || f.parcelas === '' ? 1 : parseInt(f.parcelas);
  if(!(n >= 1 && n <= 12)) fail('O número de parcelas deve ser de 1 a 12.');
  if(!dataValida(f.vencimento)) fail(n > 1 ? 'Informe o vencimento da primeira parcela.' : 'Informe o vencimento.');
  const base = arred(valor / n), plano = [];
  let acum = 0;
  for(let i = 0; i < n; i++){
    const v = i === n - 1 ? arred(valor - acum) : base;
    acum = arred(acum + v);
    plano.push({valor:v, vencimento:somaMeses(f.vencimento, i), parcela:i + 1, parcelas:n});
  }
  return plano;
}

function criarContas(db, plano, base){
  normalizar(db);
  const ts = Date.now();
  plano.forEach((p, i) => db.bills.push({id:uid(), ...base, ...p, status:'pendente', dataPagamento:'', criado:hoje(), ts:ts + i}));
}

export function addEntrada(db, f){
  const p = produtoOuFalha(db, f.produto);
  const seriais = parseSeriais(f.seriais);
  const q = seriais.length || parseInt(f.qtd);
  if(!q || q < 1) fail('Informe a quantidade.');
  if(new Set(seriais).size !== seriais.length) fail('Há números de série repetidos na lista.');
  const existe = seriais.find(s => db.units.some(u => u.serial === s));
  if(existe) fail(`A série ${existe} já está cadastrada.`);
  const custo = parseFloat(f.custo) || p.custoPadrao || 0;
  const aPagar = f.condicao === 'pagar';
  const plano = aPagar ? planoParcelas(q * custo, f) : [];
  const data = f.data || hoje(), id = uid(), ts = Date.now();
  for(let i=0; i<q; i++)
    db.units.push({id:uid(), productId:p.id, serial:seriais[i]||'', custo, status:'disponivel', entradaId:id, saidaId:'', dataEntrada:data, dataSaida:'', ts:ts+i});
  const fornecedor = str(f.fornecedor).trim(), forn = acharPorNome(db.suppliers, fornecedor);
  db.moves.push({id, tipo:'entrada', data, productId:p.id, qty:q, custoUnit:custo, valor:q*custo,
    fornecedor, ...(forn && {supplierId:forn.id}), ...(aPagar && {aPagar:true}), serials:seriais, obs:str(f.obs).trim(), ts});
  if(aPagar) criarContas(db, plano, {tipo:'pagar', origem:'entrada', moveId:id, descricao:`Compra de ${nomeProd(p)} (${q} un.)`, parte:fornecedor, ...(forn && {partyId:forn.id})});
  return `${q} unidade(s) registrada(s)` + (aPagar ? `, a pagar em ${plano.length}x.` : '.');
}

/** Escolhe as unidades que saem: as séries informadas, ou as mais antigas (FIFO). */
function escolherUnidades(db, p, seriais, q){
  const disp = sortUnits(units(db, p.id));
  if(seriais.length){
    const escolhidas = [];
    for(const s of seriais){
      const u = disp.find(x => x.serial === s && !escolhidas.includes(x));
      if(!u) fail(`A série ${s} não está disponível para ${nomeProd(p)}.`);
      escolhidas.push(u);
    }
    return escolhidas;
  }
  if(q > disp.length) fail(`Estoque insuficiente. Disponível: ${disp.length}.`);
  return disp.slice(0, q);
}

export function addVenda(db, f){
  const p = produtoOuFalha(db, f.produto);
  const seriais = parseSeriais(f.seriais);
  const preco = parseFloat(f.preco);
  if(isNaN(preco) || preco < 0) fail('Informe o preço unitário.');
  const q = seriais.length || parseInt(f.qtd);
  if(!q || q < 1) fail('Informe a quantidade.');
  const escolhidas = escolherUnidades(db, p, seriais, q);
  const data = f.data || hoje(), id = uid();
  const custo = escolhidas.reduce((s,u) => s + u.custo, 0), valor = q * preco;
  const cliente = str(f.cliente).trim(), cli = acharPorNome(db.customers, cliente);
  const aReceber = f.recebimento === 'receber';
  if(aReceber && !cliente) fail('Informe o cliente: uma venda a receber precisa do nome de quem vai pagar.');
  const plano = aReceber ? planoParcelas(valor, f) : [];
  escolhidas.forEach(u => { u.status='vendido'; u.saidaId=id; u.dataSaida=data; });
  db.moves.push({id, tipo:'venda', data, productId:p.id, qty:q, precoUnit:preco, valor, custo, lucro:valor-custo,
    cliente, ...(cli && {customerId:cli.id}), ...(aReceber && {aReceber:true}), pagamento:f.pagamento, serials:escolhidas.map(u=>u.serial).filter(Boolean),
    obs:str(f.obs).trim(), cancelada:false, ts:Date.now()});
  if(aReceber) criarContas(db, plano, {tipo:'receber', origem:'venda', moveId:id, descricao:`Venda de ${nomeProd(p)} (${q} un.)`, parte:cliente, ...(cli && {partyId:cli.id})});
  return aReceber ? `Venda registrada, a receber em ${plano.length}x.` : 'Venda registrada.';
}

/** Devolve ao estoque as unidades da venda. Não faz nada se já estiver cancelada. */
export function cancelarVenda(db, id){
  const m = db.moves.find(x => x.id === id);
  if(!m || m.tipo !== 'venda' || m.cancelada) return null;
  db.units.filter(u => u.saidaId === id).forEach(u => { u.status='disponivel'; u.saidaId=''; u.dataSaida=''; });
  m.cancelada = true;
  const contas = normalizar(db).bills.filter(b => b.moveId === id && b.status !== 'cancelada');
  const jaRecebido = contas.filter(b => b.status === 'pago').length;
  contas.forEach(b => { b.status = 'cancelada'; });
  db.moves.push({id:uid(), tipo:'cancelamento', data:hoje(), productId:m.productId, qty:m.qty, valor:-m.valor, ref:m.id,
    serials:m.serials||[], obs:`Venda de ${fmtDate(m.data)} cancelada`, ts:Date.now()});
  return 'Venda cancelada. As unidades voltaram ao estoque.' + (jaRecebido ? ` Atenção: ${jaRecebido} parcela(s) já tinha(m) sido recebida(s); devolva o valor ao cliente.` : '');
}

export function addBaixa(db, f){
  const p = produtoOuFalha(db, f.produto);
  const q = parseInt(f.qtd);
  if(!q || q < 1) fail('Informe a quantidade.');
  const escolhidas = escolherUnidades(db, p, [], q);
  const id = uid(), data = f.data || hoje();
  const custo = escolhidas.reduce((s,u) => s + u.custo, 0);
  escolhidas.forEach(u => { u.status='baixa'; u.saidaId=id; u.dataSaida=data; });
  db.moves.push({id, tipo:'baixa', data, productId:p.id, qty:q, valor:custo, motivo:f.motivo,
    serials:escolhidas.map(u=>u.serial).filter(Boolean), obs:str(f.obs).trim(), ts:Date.now()});
  return 'Baixa registrada.';
}

export function addDespesa(db, f){
  if(!CATEGORIAS_DESPESA.includes(f.categoria)) fail('Escolha a categoria da despesa.');
  const valor = parseFloat(f.valor);
  if(isNaN(valor) || valor <= 0) fail('Informe o valor da despesa.');
  db.moves.push({id:uid(), tipo:'despesa', data:f.data || hoje(), categoria:f.categoria, valor, obs:str(f.obs).trim(), ts:Date.now()});
  return 'Despesa registrada.';
}

export function excluirDespesa(db, id){
  if(!db.moves.some(m => m.id === id && m.tipo === 'despesa')) return null;
  db.moves = db.moves.filter(m => m.id !== id);
  return 'Despesa excluída.';
}

/* ---------- contas a receber e a pagar ---------- */

export function addContaPagar(db, f){
  if(!CATEGORIAS_DESPESA.includes(f.categoria)) fail('Escolha a categoria da despesa.');
  const descricao = str(f.descricao).trim() || f.categoria;
  const valor = parseFloat(f.valor);
  if(isNaN(valor) || valor <= 0) fail('Informe o valor da conta.');
  const plano = planoParcelas(valor, f);
  criarContas(db, plano, {tipo:'pagar', origem:'manual', descricao, categoria:f.categoria, parte:str(f.parte).trim(), obs:str(f.obs).trim()});
  return plano.length > 1 ? `${plano.length} parcelas a pagar registradas.` : 'Conta a pagar registrada.';
}

/** Marca como recebida/paga. Conta avulsa a pagar vira despesa na data do pagamento. */
export function pagarConta(db, id, data){
  const b = normalizar(db).bills.find(x => x.id === id) || fail('Conta não encontrada.');
  if(b.status !== 'pendente') fail('Esta conta não está pendente.');
  const quando = data || hoje();
  if(!dataValida(quando)) fail('Data de pagamento inválida.');
  b.status = 'pago'; b.dataPagamento = quando;
  if(b.tipo === 'pagar' && b.origem === 'manual'){
    const despesaId = uid();
    db.moves.push({id:despesaId, tipo:'despesa', data:quando, categoria:b.categoria || 'Outros', valor:b.valor, obs:b.descricao, billId:b.id, ts:Date.now()});
    b.despesaId = despesaId;
  }
  return b.tipo === 'receber' ? 'Recebimento registrado.' : 'Pagamento registrado.';
}

export function desfazerPagamento(db, id){
  const b = normalizar(db).bills.find(x => x.id === id) || fail('Conta não encontrada.');
  if(b.status !== 'pago') fail('Esta conta não está paga.');
  if(b.despesaId) db.moves = db.moves.filter(m => m.id !== b.despesaId);
  b.status = 'pendente'; b.dataPagamento = ''; delete b.despesaId;
  return 'Pagamento desfeito: a conta voltou a ficar pendente.';
}

/** Só contas avulsas e pendentes. As ligadas a uma venda são canceladas junto com a venda. */
export function excluirConta(db, id){
  const b = normalizar(db).bills.find(x => x.id === id);
  if(!b) return null;
  if(b.origem !== 'manual') fail('Esta conta veio de uma venda ou de uma compra. Para desfazer, cancele a venda.');
  if(b.status !== 'pendente') fail('Desfaça o pagamento antes de excluir a conta.');
  db.bills = db.bills.filter(x => x.id !== id);
  return 'Conta excluída.';
}

/** Lê o texto de um backup JSON e devolve o db, ou lança DomainError. */
export function parseBackup(texto){
  const t = str(texto).trim();
  if(!t) fail('Cole o conteúdo do backup.');
  let d;
  try{ d = JSON.parse(t); }catch(e){ fail('Conteúdo inválido. Verifique o backup.'); }
  if(!isDb(d)) fail('Este conteúdo não é um backup deste sistema.');
  return normalizar(d);
}
