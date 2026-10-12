import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, stock, avgCost, situacao, units } from '../src/domain/queries.js';
import { DomainError } from '../src/domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo, addDespesa, excluirDespesa, salvarCliente, salvarFornecedor, excluirCliente, excluirFornecedor } from '../src/domain/operations.js';
import { resumo, expText, intervalo, noPeriodo, balanco, serieVendas, topProdutos, estoqueMaisAntigo, resumoClientes, resumoFornecedores, topClientes, comprasDoCliente } from '../src/domain/reports.js';

const novoProduto = (db, extra={}) => {
  salvarProduto(db, {nome:'Bip 5', custoPadrao:'200', precoPadrao:'350', minimo:'2', ...extra});
  return db.products.at(-1);
};
const entrada = (db, p, extra={}) => addEntrada(db, {produto:p.id, qtd:'1', data:'2026-01-10', ...extra});
const venda = (db, p, extra={}) => addVenda(db, {produto:p.id, qtd:'1', preco:'350', data:'2026-02-01', pagamento:'Pix', ...extra});
const erro = (fn, msg) => assert.throws(fn, e => e instanceof DomainError && (!msg || e.message.includes(msg)));

describe('produtos', () => {
  test('cadastra, edita e exige nome', () => {
    const db = emptyDb();
    erro(() => salvarProduto(db, {nome:'  '}), 'nome do modelo');
    const p = novoProduto(db);
    assert.equal(p.custoPadrao, 200);
    assert.equal(p.minimo, 2);
    salvarProduto(db, {id:p.id, nome:'Bip 5 Pro'});
    assert.equal(db.products.length, 1);
    assert.equal(p.nome, 'Bip 5 Pro');
  });

  test('só exclui produto sem movimentações', () => {
    const db = emptyDb();
    const a = novoProduto(db), b = novoProduto(db, {nome:'GT 4'});
    entrada(db, a);
    erro(() => excluirProduto(db, a.id), 'movimentações');
    excluirProduto(db, b.id);
    assert.deepEqual(db.products.map(p => p.id), [a.id]);
  });
});

describe('entrada', () => {
  test('sem séries cria unidades com o custo padrão', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3'});
    assert.equal(stock(db, p.id), 3);
    assert.ok(db.units.every(u => u.custo === 200 && u.serial === ''));
    assert.equal(db.moves[0].valor, 600);
  });

  test('custo informado vence o padrão', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', custo:'150.5'});
    assert.equal(avgCost(db, p.id), 150.5);
  });

  test('com séries, a quantidade é o número de séries', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'9', seriais:'A1\nA2, A3;A4'});
    assert.deepEqual(units(db, p.id).map(u => u.serial), ['A1','A2','A3','A4']);
  });

  test('rejeita série repetida na lista e série já cadastrada', () => {
    const db = emptyDb(), p = novoProduto(db);
    erro(() => entrada(db, p, {seriais:'A1\nA1'}), 'repetidos');
    assert.equal(db.units.length, 0);
    entrada(db, p, {seriais:'A1'});
    erro(() => entrada(db, p, {seriais:'A2\nA1'}), 'A1 já está cadastrada');
    assert.equal(db.units.length, 1);
  });

  test('exige produto e quantidade', () => {
    const db = emptyDb(), p = novoProduto(db);
    erro(() => addEntrada(db, {produto:'x', qtd:'1'}), 'Escolha o produto');
    erro(() => entrada(db, p, {qtd:'0'}), 'quantidade');
    erro(() => entrada(db, p, {qtd:''}), 'quantidade');
  });
});

describe('venda e FIFO', () => {
  test('sem séries vende as unidades mais antigas, pela data de entrada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'NOVA', data:'2026-03-01', custo:'300'});
    entrada(db, p, {seriais:'VELHA', data:'2026-01-01', custo:'100'});
    entrada(db, p, {seriais:'MEIO', data:'2026-02-01', custo:'200'});
    venda(db, p, {qtd:'2'});
    assert.deepEqual(units(db, p.id).map(u => u.serial), ['NOVA']);
    const m = db.moves.at(-1);
    assert.deepEqual(m.serials, ['VELHA','MEIO']);
    assert.equal(m.custo, 300);
  });

  test('na mesma data, desempata pela ordem de cadastro', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'1\n2\n3'});
    venda(db, p, {qtd:'2'});
    assert.deepEqual(units(db, p.id).map(u => u.serial), ['3']);
  });

  test('custo e lucro vêm das unidades que saíram', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {data:'2026-01-01', custo:'100'});
    entrada(db, p, {data:'2026-01-02', custo:'200'});
    venda(db, p, {qtd:'2', preco:'500'});
    const m = db.moves.at(-1);
    assert.equal(m.valor, 1000);
    assert.equal(m.custo, 300);
    assert.equal(m.lucro, 700);
  });

  test('com séries vende exatamente as informadas, fora da ordem FIFO', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'A\nB\nC'});
    venda(db, p, {seriais:'C'});
    assert.deepEqual(units(db, p.id).map(u => u.serial), ['A','B']);
    assert.equal(db.units.find(u => u.serial === 'C').status, 'vendido');
  });

  test('estoque insuficiente não altera nada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2'});
    erro(() => venda(db, p, {qtd:'3'}), 'Disponível: 2');
    assert.equal(stock(db, p.id), 2);
    assert.equal(db.moves.length, 1);
  });

  test('série indisponível, repetida ou de outro produto é recusada sem efeitos', () => {
    const db = emptyDb(), p = novoProduto(db), q = novoProduto(db, {nome:'GT 4'});
    entrada(db, p, {seriais:'A\nB'});
    entrada(db, q, {seriais:'Z'});
    erro(() => venda(db, p, {seriais:'A\nNAO'}), 'NAO não está disponível');
    erro(() => venda(db, p, {seriais:'A\nA'}), 'A não está disponível');
    erro(() => venda(db, p, {seriais:'Z'}), 'Z não está disponível');
    assert.equal(stock(db, p.id), 2);
    venda(db, p, {seriais:'A'});
    erro(() => venda(db, p, {seriais:'A'}), 'A não está disponível');
  });

  test('valida o preço: obrigatório, zero é permitido', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2'});
    erro(() => venda(db, p, {preco:''}), 'preço');
    erro(() => venda(db, p, {preco:'-1'}), 'preço');
    venda(db, p, {preco:'0'});
    assert.equal(db.moves.at(-1).valor, 0);
  });
});

describe('cancelamento', () => {
  test('devolve as mesmas unidades ao estoque e registra o cancelamento', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'A\nB'});
    venda(db, p, {seriais:'B'});
    const v = db.moves.find(m => m.tipo === 'venda');
    cancelarVenda(db, v.id);
    assert.equal(stock(db, p.id), 2);
    const u = db.units.find(x => x.serial === 'B');
    assert.equal(u.status, 'disponivel');
    assert.equal(u.saidaId, '');
    assert.equal(u.dataSaida, '');
    assert.equal(v.cancelada, true);
    const c = db.moves.at(-1);
    assert.equal(c.tipo, 'cancelamento');
    assert.equal(c.valor, -v.valor);
    assert.equal(c.ref, v.id);
  });

  test('cancelar duas vezes não faz nada na segunda', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    venda(db, p);
    const id = db.moves.find(m => m.tipo === 'venda').id;
    assert.ok(cancelarVenda(db, id));
    const n = db.moves.length;
    assert.equal(cancelarVenda(db, id), null);
    assert.equal(db.moves.length, n);
  });

  test('não mexe em unidades de outras saídas', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'A\nB'});
    venda(db, p, {seriais:'A'});
    venda(db, p, {seriais:'B'});
    cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    assert.deepEqual(units(db, p.id).map(u => u.serial), ['A']);
  });

  test('a unidade devolvida volta a ser a primeira da fila FIFO', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {seriais:'VELHA', data:'2026-01-01'});
    entrada(db, p, {seriais:'NOVA', data:'2026-02-01'});
    venda(db, p);
    cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    venda(db, p);
    assert.equal(db.moves.filter(m => m.tipo === 'venda').at(-1).serials[0], 'VELHA');
  });
});

describe('baixa', () => {
  test('consome as mais antigas e registra o custo como perda', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {data:'2026-01-01', custo:'100'});
    entrada(db, p, {data:'2026-01-02', custo:'200'});
    addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito'});
    const m = db.moves.at(-1);
    assert.equal(m.tipo, 'baixa');
    assert.equal(m.valor, 100);
    assert.equal(m.motivo, 'Defeito');
    assert.equal(units(db, p.id, 'baixa').length, 1);
    assert.equal(stock(db, p.id), 1);
  });

  test('estoque insuficiente e quantidade inválida', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    erro(() => addBaixa(db, {produto:p.id, qtd:'2'}), 'Disponível: 1');
    erro(() => addBaixa(db, {produto:p.id, qtd:'0'}), 'quantidade');
    assert.equal(stock(db, p.id), 1);
  });

  test('baixa não é desfeita pelo cancelamento de venda', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    addBaixa(db, {produto:p.id, qtd:'1'});
    assert.equal(cancelarVenda(db, db.moves.at(-1).id), null);
    assert.equal(stock(db, p.id), 0);
  });
});

describe('situação, resumo e exportação', () => {
  test('situação: sem entradas, baixo, ok e zerado', () => {
    const db = emptyDb(), p = novoProduto(db);
    assert.equal(situacao(db, p)[1], 'Sem entradas');
    assert.equal(resumo(db, 'tudo').alertas.length, 0, 'produto sem entradas não gera alerta');
    entrada(db, p, {qtd:'2'});
    assert.equal(situacao(db, p)[1], 'Baixo');
    entrada(db, p);
    assert.equal(situacao(db, p)[1], 'OK');
    venda(db, p, {qtd:'3'});
    assert.equal(situacao(db, p)[1], 'Zerado');
    assert.deepEqual(resumo(db, 'tudo').alertas, [p]);
  });

  test('resumo ignora vendas canceladas', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3', custo:'100'});
    venda(db, p, {preco:'300'});
    venda(db, p, {preco:'400'});
    cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    addBaixa(db, {produto:p.id, qtd:'1'});
    const r = resumo(db, 'tudo');
    assert.equal(r.receita, 400);
    assert.equal(r.lucro, 300);
    assert.equal(r.margem, 75);
    assert.equal(sum(r.baixas), 100);
    assert.equal(r.disp.length, 1);
    assert.equal(r.valorEstoque, 100);
  });

  test('CSV tem cabeçalho e uma linha por movimentação', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {fornecedor:'Forn;A'});
    venda(db, p);
    const linhas = expText(db, 'csv').split('\n');
    assert.equal(linhas.length, 3);
    assert.ok(linhas[0].startsWith('Data;Tipo;'));
    assert.ok(linhas[1].includes('Forn A'));
    assert.deepEqual(JSON.parse(expText(db, 'json')), db);
  });
});

describe('backup', () => {
  test('aceita JSON válido e recusa o resto', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    assert.deepEqual(parseBackup(JSON.stringify(db)), db);
    erro(() => parseBackup(''), 'Cole');
    erro(() => parseBackup('{oops'), 'inválido');
    erro(() => parseBackup('{"products":[]}'), 'não é um backup');
  });
});

function sum(arr){ return arr.reduce((s,m) => s + m.valor, 0); }

describe('importação de catálogo', () => {
  const itens = [
    {nome:'S10', marca:'Microwear', variante:'', custoPadrao:49, precoPadrao:0, minimo:0, fornecedor:'X', obs:''},
    {nome:'Easy', marca:'Wearzone', variante:'', custoPadrao:95, precoPadrao:199, minimo:0, fornecedor:'X', obs:''},
  ];

  test('cadastra os itens e rodar de novo não duplica', async () => {
    const db = emptyDb();
    assert.match(importarCatalogo(db, itens), /2 produto\(s\) importado\(s\)\./);
    assert.equal(db.products.length, 2);
    assert.ok(db.products.every(p => p.id && p.criado));
    assert.match(importarCatalogo(db, itens), /Nenhum produto novo/);
    assert.equal(db.products.length, 2);
  });

  test('não sobrescreve produto já editado e ignora maiúsculas', () => {
    const db = emptyDb();
    importarCatalogo(db, itens);
    salvarProduto(db, {id:db.products[0].id, nome:'S10', marca:'Microwear', custoPadrao:'51', precoPadrao:'99'});
    importarCatalogo(db, [{...itens[0], nome:'s10', marca:'MICROWEAR'}, {...itens[1], nome:'Pulse'}]);
    assert.equal(db.products.length, 3);
    assert.equal(db.products[0].custoPadrao, 51);
  });

  test('o catálogo da XDistribuidora é válido e entra inteiro', async () => {
    const {CATALOGO_XDISTRIBUIDORA: cat} = await import('../src/data/catalogo-xdistribuidora.js');
    const chaves = cat.map(i => [i.marca, i.nome, i.variante].join('|').toLowerCase());
    assert.equal(new Set(chaves).size, cat.length, 'sem itens repetidos');
    for(const i of cat){
      assert.ok(i.nome, 'nome obrigatório');
      assert.ok(i.custoPadrao > 0, `${i.nome}: custo deve ser maior que zero`);
      assert.ok(i.precoPadrao === 0 || i.precoPadrao > i.custoPadrao, `${i.nome}: preço de venda abaixo do custo`);
      assert.equal(i.fornecedor, 'XDistribuidora');
    }
    const db = emptyDb();
    importarCatalogo(db, cat);
    assert.equal(db.products.length, cat.length);
  });
});


describe('despesas', () => {
  test('registra, valida categoria e valor, e exclui', () => {
    const db = emptyDb();
    erro(() => addDespesa(db, {categoria:'Café', valor:'10'}), 'categoria');
    erro(() => addDespesa(db, {categoria:'Frete', valor:''}), 'valor');
    erro(() => addDespesa(db, {categoria:'Frete', valor:'0'}), 'valor');
    erro(() => addDespesa(db, {categoria:'Produto', valor:'10'}), 'categoria');  // produto entra por Entradas
    addDespesa(db, {categoria:'Frete', valor:'25.5', data:'2026-10-05', obs:' Sedex '});
    assert.equal(db.moves.length, 1);
    assert.deepEqual([db.moves[0].tipo, db.moves[0].valor, db.moves[0].obs], ['despesa', 25.5, 'Sedex']);
    assert.equal(excluirDespesa(db, 'nao-existe'), null);
    assert.equal(excluirDespesa(db, db.moves[0].id), 'Despesa excluída.');
    assert.equal(db.moves.length, 0);
  });

  test('excluirDespesa não apaga venda nem entrada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    assert.equal(excluirDespesa(db, db.moves[0].id), null);
    assert.equal(db.moves.length, 1);
  });
});

describe('períodos', () => {
  const ref = '2026-10-12';
  test('intervalos', () => {
    assert.deepEqual(intervalo('hoje', ref), [ref, ref]);
    assert.deepEqual(intervalo('7d', ref), ['2026-10-06', ref]);
    assert.deepEqual(intervalo('mes', ref), ['2026-10-01', '2026-10-31']);
    assert.deepEqual(intervalo('mesAnt', ref), ['2026-09-01', '2026-09-30']);
    assert.deepEqual(intervalo('mesAnt', '2026-01-15'), ['2025-12-01', '2025-12-31']);
    assert.equal(intervalo('tudo', ref), null);
  });

  test('noPeriodo respeita as bordas', () => {
    const m = d => ({data:d});
    assert.ok(noPeriodo(m('2026-10-06'), '7d', ref));
    assert.ok(!noPeriodo(m('2026-10-05'), '7d', ref));
    assert.ok(noPeriodo(m('2026-09-30'), 'mesAnt', ref));
    assert.ok(!noPeriodo(m('2026-10-01'), 'mesAnt', ref));
    assert.ok(noPeriodo(m('1999-01-01'), 'tudo', ref));
  });
});

describe('balanço', () => {
  const ref = '2026-10-12';
  function cenario(){
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'4', custo:'100', data:'2026-10-01'});                       // compra: R$ 400
    venda(db, p, {qtd:'1', preco:'300', pagamento:'Pix', data:'2026-10-10'});          // custo 100
    venda(db, p, {qtd:'1', preco:'350', pagamento:'Maquininha', data:'2026-10-11'});   // custo 100
    addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito', data:'2026-10-11'});        // perda 100
    addDespesa(db, {categoria:'Frete', valor:'20', data:'2026-10-10'});
    addDespesa(db, {categoria:'Taxa de cartão', valor:'15', data:'2026-10-11'});
    return {db, p};
  }

  test('lucro, caixa e estoque parado são visões separadas', () => {
    const {db} = cenario();
    const b = balanco(db, 'tudo', ref);
    assert.equal(b.receita, 650);
    assert.equal(b.custoVendido, 200);
    assert.equal(b.lucroBruto, 450);
    assert.equal(b.perdas, 100);
    assert.equal(b.despesas, 35);
    assert.equal(b.lucroLiquido, 315);                 // 450 - 100 - 35
    assert.equal(b.compras, 400);
    assert.equal(b.caixaSaiu, 435);                    // compra + despesas
    assert.equal(b.saldo, 215);                        // 650 - 435
    assert.equal(b.dinheiroParado, 100);               // 1 aparelho sobrou, custo 100
  });

  test('vendas por forma de pagamento seguem a ordem Pix, Dinheiro, Maquininha', () => {
    const {db, p} = cenario();
    venda(db, p, {qtd:'1', preco:'100', pagamento:'Dinheiro', data:'2026-10-12'});
    const f = balanco(db, 'tudo', ref).porPagamento;
    assert.deepEqual(f.map(x => x.forma), ['Pix','Dinheiro','Maquininha']);
    assert.deepEqual(f.map(x => x.valor), [300, 100, 350]);
    assert.equal(Math.round(f.reduce((s, x) => s + x.pct, 0)), 100);
  });

  test('despesas por categoria incluem as compras de produto', () => {
    const {db} = cenario();
    const c = balanco(db, 'tudo', ref).porCategoria;
    assert.deepEqual(c.map(x => x.categoria), ['Produto (compras)', 'Frete', 'Taxa de cartão']);
    assert.deepEqual(c.map(x => x.valor), [400, 20, 15]);
  });

  test('o período filtra vendas, despesas e compras; venda cancelada não conta', () => {
    const {db} = cenario();
    const hoje7 = balanco(db, 'hoje', '2026-10-11');
    assert.equal(hoje7.receita, 350);
    assert.equal(hoje7.despesas, 15);
    assert.equal(hoje7.compras, 0);
    cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    assert.equal(balanco(db, 'tudo', ref).receita, 350);
  });

  test('sem nada registrado, tudo zera sem dividir por zero', () => {
    const b = balanco(emptyDb(), 'tudo', ref);
    assert.deepEqual([b.receita, b.lucroLiquido, b.margemLiquida, b.saldo], [0, 0, 0, 0]);
  });
});

describe('estatísticas', () => {
  const ref = '2026-10-12';
  test('série diária inclui os dias sem venda', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3', custo:'100', data:'2026-10-01'});
    venda(db, p, {preco:'300', data:'2026-10-10'});
    venda(db, p, {preco:'200', data:'2026-10-12'});
    const {mensal, pontos} = serieVendas(db, '7d', ref);
    assert.equal(mensal, false);
    assert.equal(pontos.length, 7);
    assert.deepEqual(pontos.map(x => x.receita), [0, 0, 0, 0, 300, 0, 200]);
    assert.equal(pontos[4].lucro, 200);
    assert.equal(pontos[6].rotulo, '12/10');
  });

  test('em "tudo", passa para mensal quando o intervalo é longo', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', custo:'100', data:'2026-01-01'});
    venda(db, p, {preco:'300', data:'2026-01-15'});
    venda(db, p, {preco:'400', data:'2026-10-02'});
    const {mensal, pontos} = serieVendas(db, 'tudo', ref);
    assert.equal(mensal, true);
    assert.equal(pontos.length, 10);
    assert.equal(pontos[0].rotulo, '01/2026');
    assert.equal(pontos[0].receita, 300);
    assert.equal(pontos[9].receita, 400);
  });

  test('sem vendas em "tudo", a série vem vazia', () => {
    assert.deepEqual(serieVendas(emptyDb(), 'tudo', ref).pontos, []);
  });

  test('top produtos ordena por lucro e calcula a margem', () => {
    const db = emptyDb(), a = novoProduto(db, {nome:'A'}), b = novoProduto(db, {nome:'B'});
    entrada(db, a, {qtd:'3', custo:'100'});
    entrada(db, b, {qtd:'3', custo:'100'});
    venda(db, a, {qtd:'1', preco:'150'});          // lucro 50
    venda(db, b, {qtd:'2', preco:'200'});          // receita 400, lucro 200
    const t = topProdutos(db, 'tudo', ref);
    assert.deepEqual(t.map(x => x.nome), ['B', 'A']);
    assert.equal(t[0].margem, 50);
    assert.equal(t[0].qtd, 2);
  });

  test('estoque mais antigo conta os dias desde a entrada mais velha disponível', () => {
    const db = emptyDb(), a = novoProduto(db, {nome:'A'}), b = novoProduto(db, {nome:'B'}), c = novoProduto(db, {nome:'C'});
    entrada(db, a, {data:'2026-10-02'});
    entrada(db, a, {data:'2026-10-10'});
    entrada(db, b, {data:'2026-09-12'});
    const r = estoqueMaisAntigo(db, ref);
    assert.deepEqual(r.map(x => [x.nome, x.dias, x.qtd]), [['B', 30, 1], ['A', 10, 2]]);   // C sem estoque fica de fora
  });
});

describe('exportação de despesas', () => {
  test('a despesa vira linha do CSV com a categoria no lugar do produto', () => {
    const db = emptyDb();
    addDespesa(db, {categoria:'Anúncios', valor:'50', data:'2026-10-05'});
    const linha = expText(db, 'csv').split('\n')[1];
    assert.ok(linha.startsWith('05/10/2026;Despesa;Anúncios;;50,00'));
  });
});


describe('clientes e fornecedores', () => {
  test('cadastra, exige nome, não repete nome e edita', () => {
    const db = emptyDb();
    erro(() => salvarCliente(db, {nome:'  '}), 'nome do cliente');
    assert.equal(salvarCliente(db, {nome:' Maria ', telefone:'85 99999-0000'}), 'Cliente cadastrado.');
    assert.equal(db.customers[0].nome, 'Maria');
    erro(() => salvarCliente(db, {nome:'maria'}), 'Já existe um cliente');
    salvarCliente(db, {id:db.customers[0].id, nome:'Maria Silva', telefone:'85 98888-0000'});
    assert.equal(db.customers.length, 1);
    assert.equal(db.customers[0].telefone, '85 98888-0000');
    erro(() => salvarCliente(db, {id:'x', nome:'Outra'}), 'não encontrado');
  });

  test('editar o próprio cadastro sem mudar o nome não conta como repetido', () => {
    const db = emptyDb();
    salvarCliente(db, {nome:'Ana'});
    assert.doesNotThrow(() => salvarCliente(db, {id:db.customers[0].id, nome:'Ana', obs:'VIP'}));
    assert.equal(db.customers[0].obs, 'VIP');
  });

  test('fornecedor guarda as condições de compra', () => {
    const db = emptyDb();
    salvarFornecedor(db, {nome:'XDistribuidora', pedidoMinimo:'5 peças', prazo:'48 horas', pagamento:'Pix'});
    assert.deepEqual([db.suppliers[0].pedidoMinimo, db.suppliers[0].prazo, db.suppliers[0].pagamento], ['5 peças', '48 horas', 'Pix']);
    erro(() => salvarFornecedor(db, {nome:'xdistribuidora'}), 'Já existe um fornecedor');
  });

  test('a venda liga o cliente pelo nome; nome novo continua valendo só como texto', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarCliente(db, {nome:'Maria'});
    entrada(db, p, {qtd:'3'});
    venda(db, p, {cliente:'MARIA'});
    venda(db, p, {cliente:'João'});
    const [v1, v2] = db.moves.filter(m => m.tipo === 'venda');
    assert.equal(v1.customerId, db.customers[0].id);
    assert.equal(v2.customerId, undefined);
    assert.equal(v2.cliente, 'João');
  });

  test('a entrada liga o fornecedor pelo nome', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarFornecedor(db, {nome:'XDistribuidora'});
    entrada(db, p, {fornecedor:'xdistribuidora'});
    entrada(db, p, {fornecedor:'Outro'});
    const [e1, e2] = db.moves.filter(m => m.tipo === 'entrada');
    assert.equal(e1.supplierId, db.suppliers[0].id);
    assert.equal(e2.supplierId, undefined);
  });

  test('resumo do cliente soma vendas por id e por nome (vendas antigas), sem as canceladas', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'5', custo:'100'});
    venda(db, p, {cliente:'Maria', preco:'300', data:'2026-10-01'});     // antes do cadastro: só texto
    salvarCliente(db, {nome:'Maria'});
    venda(db, p, {cliente:'Maria', preco:'200', data:'2026-10-10'});     // ligada por id
    venda(db, p, {cliente:'Maria', preco:'500', data:'2026-10-11'});
    cancelarVenda(db, db.moves.filter(m => m.tipo === 'venda').at(-1).id);
    venda(db, p, {cliente:'Outra pessoa', preco:'999'});
    const [r] = resumoClientes(db);
    assert.deepEqual([r.compras, r.total, r.ticket, r.ultima], [2, 500, 250, '2026-10-10']);
    assert.equal(comprasDoCliente(db, db.customers[0]).length, 2);
  });

  test('clientes ordenados por quanto compraram', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarCliente(db, {nome:'A'}); salvarCliente(db, {nome:'B'}); salvarCliente(db, {nome:'C'});
    entrada(db, p, {qtd:'5'});
    venda(db, p, {cliente:'B', preco:'300'});
    venda(db, p, {cliente:'A', preco:'100'});
    assert.deepEqual(resumoClientes(db).map(c => c.nome), ['B', 'A', 'C']);
  });

  test('quem mais comprou no período ignora venda sem cliente e junta nomes iguais', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'6', custo:'10'});
    venda(db, p, {cliente:'Maria', preco:'100', data:'2026-10-10'});
    venda(db, p, {cliente:'maria', preco:'50', data:'2026-10-11'});
    venda(db, p, {cliente:'', preco:'900', data:'2026-10-11'});
    venda(db, p, {cliente:'Zé', preco:'120', data:'2026-09-01'});
    const t = topClientes(db, 'tudo', '2026-10-12');
    assert.deepEqual(t.map(x => [x.nome, x.compras, x.total]), [['Zé', 1, 120], ['Maria', 2, 150]].sort((a, b) => b[2] - a[2]));
    assert.deepEqual(topClientes(db, 'mes', '2026-10-12').map(x => x.nome), ['Maria']);
  });

  test('resumo do fornecedor soma o que foi comprado', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarFornecedor(db, {nome:'XDistribuidora'});
    entrada(db, p, {qtd:'5', custo:'100', fornecedor:'XDistribuidora', data:'2026-10-01'});
    entrada(db, p, {qtd:'2', custo:'110', fornecedor:'xdistribuidora', data:'2026-10-09'});
    entrada(db, p, {qtd:'9', custo:'1', fornecedor:'Outro'});
    const [r] = resumoFornecedores(db);
    assert.deepEqual([r.entradas, r.unidades, r.total, r.ultima], [2, 7, 720, '2026-10-09']);
  });

  test('excluir mantém o histórico e ignora id inexistente', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarCliente(db, {nome:'Maria'}); salvarFornecedor(db, {nome:'F'});
    entrada(db, p, {fornecedor:'F'}); venda(db, p, {cliente:'Maria'});
    assert.equal(excluirCliente(db, 'nao'), null);
    assert.match(excluirCliente(db, db.customers[0].id), /histórico/);
    assert.match(excluirFornecedor(db, db.suppliers[0].id), /histórico/);
    assert.deepEqual([db.customers.length, db.suppliers.length], [0, 0]);
    assert.equal(db.moves.find(m => m.tipo === 'venda').cliente, 'Maria');
  });

  test('banco e backup antigos, sem clientes e fornecedores, continuam abrindo', () => {
    const antigo = {products:[], units:[], moves:[]};
    const db = parseBackup(JSON.stringify(antigo));
    assert.deepEqual([db.customers, db.suppliers], [[], []]);
    assert.doesNotThrow(() => salvarCliente({products:[], units:[], moves:[]}, {nome:'X'}));
  });
});
