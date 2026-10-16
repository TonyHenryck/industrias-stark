import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, stock, avgCost, situacao, units } from '../src/domain/queries.js';
import { DomainError } from '../src/domain/errors.js';
import { somaMeses } from '../src/domain/util.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo, addDespesa, excluirDespesa, salvarCliente, salvarFornecedor, excluirCliente, excluirFornecedor, addContaPagar, pagarConta, desfazerPagamento, excluirConta, adicionarFoto, removerFoto, salvarMeta, MAX_FOTOS } from '../src/domain/operations.js';
import { resumo, expText, intervalo, noPeriodo, balanco, serieVendas, topProdutos, estoqueMaisAntigo, resumoClientes, resumoFornecedores, topClientes, comprasDoCliente, contas, situacaoConta, consultarGarantia, garantiasVencendo, progressoMetas } from '../src/domain/reports.js';
import { parseDias, garantiaAte, situacaoGarantia, garantiaDoFornecedor, GARANTIA_PADRAO } from '../src/domain/garantia.js';

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


describe('contas a receber', () => {
  const ref = '2026-10-12';
  const vendaAReceber = (db, p, extra = {}) =>
    venda(db, p, {cliente:'Maria', preco:'300', data:'2026-10-01', recebimento:'receber', vencimento:'2026-10-20', parcelas:'1', ...extra});

  test('somaMeses mantém o dia e respeita meses curtos', () => {
    assert.equal(somaMeses('2026-01-15', 1), '2026-02-15');
    assert.equal(somaMeses('2026-01-31', 1), '2026-02-28');
    assert.equal(somaMeses('2028-01-31', 1), '2028-02-29');
    assert.equal(somaMeses('2026-11-30', 3), '2027-02-28');
    assert.equal(somaMeses('2026-12-10', 1), '2027-01-10');
  });

  test('venda a receber cria as parcelas e a última absorve o centavo', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', custo:'50'});
    assert.match(vendaAReceber(db, p, {preco:'100', parcelas:'3', vencimento:'2026-10-31'}), /a receber em 3x/);
    const b = db.bills;
    assert.deepEqual(b.map(x => x.valor), [33.33, 33.33, 33.34]);
    assert.deepEqual(b.map(x => x.vencimento), ['2026-10-31', '2026-11-30', '2026-12-31']);
    assert.deepEqual(b.map(x => x.parcela), [1, 2, 3]);
    assert.ok(b.every(x => x.tipo === 'receber' && x.origem === 'venda' && x.status === 'pendente' && x.parte === 'Maria'));
    assert.equal(db.moves.find(m => m.tipo === 'venda').aReceber, true);
  });

  test('exige cliente, vencimento válido e parcelas de 1 a 12, sem gravar nada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2'});
    erro(() => vendaAReceber(db, p, {cliente:''}), 'cliente');
    erro(() => vendaAReceber(db, p, {vencimento:''}), 'vencimento');
    erro(() => vendaAReceber(db, p, {vencimento:'20/10/2026'}), 'vencimento');
    erro(() => vendaAReceber(db, p, {parcelas:'0'}), 'parcelas');
    erro(() => vendaAReceber(db, p, {parcelas:'13'}), 'parcelas');
    assert.equal(stock(db, p.id), 2);
    assert.equal(db.bills.length, 0);
    assert.equal(db.moves.filter(m => m.tipo === 'venda').length, 0);
  });

  test('venda à vista não cria conta', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    venda(db, p);
    assert.equal(db.bills.length, 0);
  });

  test('receber a parcela: o lucro já contava a venda, o caixa só conta agora', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'1', custo:'100', data:'2026-10-01'});
    vendaAReceber(db, p, {preco:'300'});
    let b = balanco(db, 'tudo', ref);
    assert.deepEqual([b.receita, b.lucroBruto], [300, 200]);          // lucro: já reconhecido
    assert.deepEqual([b.caixaEntrou, b.aReceber], [0, 300]);          // caixa: nada entrou ainda
    assert.equal(pagarConta(db, db.bills[0].id, '2026-10-12'), 'Recebimento registrado.');
    b = balanco(db, 'tudo', ref);
    assert.deepEqual([b.caixaEntrou, b.recebimentos, b.aReceber], [300, 300, 0]);
  });

  test('o recebimento cai no período em que foi pago, não no da venda', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'1', custo:'100', data:'2026-09-01'});
    vendaAReceber(db, p, {preco:'300', data:'2026-09-05', vencimento:'2026-10-05'});
    pagarConta(db, db.bills[0].id, '2026-10-06');
    assert.equal(balanco(db, 'mesAnt', ref).caixaEntrou, 0);
    assert.equal(balanco(db, 'mes', ref).caixaEntrou, 300);
    assert.equal(balanco(db, 'mesAnt', ref).receita, 300);             // a venda é de setembro
  });

  test('situação: vencida, vence hoje, a vencer e paga', () => {
    const b = v => ({status:'pendente', vencimento:v});
    assert.equal(situacaoConta(b('2026-10-11'), ref), 'vencida');
    assert.equal(situacaoConta(b(ref), ref), 'hoje');
    assert.equal(situacaoConta(b('2026-10-13'), ref), 'aVencer');
    assert.equal(situacaoConta({status:'pago', vencimento:'2020-01-01'}, ref), 'pago');
  });

  test('lista ordenada por vencimento, com totais e vencidos', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3', custo:'10'});
    vendaAReceber(db, p, {preco:'100', vencimento:'2026-10-20'});
    vendaAReceber(db, p, {preco:'200', vencimento:'2026-10-05'});
    vendaAReceber(db, p, {preco:'50', vencimento:'2026-10-14'});
    const c = contas(db, {}, ref);
    assert.deepEqual(c.lista.map(x => x.vencimento), ['2026-10-05', '2026-10-14', '2026-10-20']);
    assert.deepEqual([c.receber, c.vencidoReceber, c.receber7, c.qtdVencidas], [350, 200, 50, 1]);
    assert.equal(contas(db, {tipo:'pagar'}, ref).lista.length, 0);
  });

  test('cancelar a venda cancela as contas e tira o dinheiro do caixa', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'1', custo:'100'});
    vendaAReceber(db, p, {preco:'300', parcelas:'2', vencimento:'2026-10-20'});
    pagarConta(db, db.bills[0].id, '2026-10-12');
    const msg = cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    assert.match(msg, /1 parcela\(s\) já tinha\(m\) sido recebida/);
    assert.ok(db.bills.every(b => b.status === 'cancelada'));
    assert.equal(contas(db, {status:'todas'}, ref).lista.length, 0);
    assert.equal(balanco(db, 'tudo', ref).caixaEntrou, 0);
  });

  test('não paga duas vezes nem conta inexistente; desfazer volta a pendente', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    vendaAReceber(db, p);
    const id = db.bills[0].id;
    pagarConta(db, id);
    erro(() => pagarConta(db, id), 'não está pendente');
    erro(() => pagarConta(db, 'x'), 'não encontrada');
    erro(() => pagarConta(db, desfazerPagamento(db, id) && id, '31/12/2026'), 'inválida');
    assert.equal(db.bills[0].status, 'pendente');
    erro(() => desfazerPagamento(db, id), 'não está paga');
  });
});

describe('contas a pagar', () => {
  const ref = '2026-10-12';

  test('entrada a pagar não sai do caixa até ser paga; o custo do estoque já existe', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'4', custo:'100', data:'2026-10-01', fornecedor:'Forn', condicao:'pagar', vencimento:'2026-10-25', parcelas:'2'});
    assert.deepEqual(db.bills.map(b => [b.tipo, b.valor, b.parte]), [['pagar', 200, 'Forn'], ['pagar', 200, 'Forn']]);
    assert.equal(stock(db, p.id), 4);
    let b = balanco(db, 'tudo', ref);
    assert.deepEqual([b.compras, b.comprasPagas, b.caixaSaiu, b.aPagar], [400, 0, 0, 400]);
    pagarConta(db, db.bills[0].id, '2026-10-12');
    b = balanco(db, 'tudo', ref);
    assert.deepEqual([b.comprasPagas, b.caixaSaiu, b.aPagar], [200, 200, 200]);
    assert.equal(b.dinheiroParado, 400);                              // estoque continua valendo o custo todo
  });

  test('entrada a pagar exige vencimento e não grava nada se faltar', () => {
    const db = emptyDb(), p = novoProduto(db);
    erro(() => entrada(db, p, {qtd:'2', condicao:'pagar'}), 'vencimento');
    assert.equal(db.units.length, 0);
    assert.equal(db.moves.length, 0);
  });

  test('entrada à vista continua saindo do caixa na hora', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', custo:'100', data:'2026-10-01', condicao:'pago'});
    assert.equal(balanco(db, 'tudo', ref).caixaSaiu, 200);
    assert.equal(db.bills.length, 0);
  });

  test('conta avulsa vira despesa só quando é paga, na data do pagamento', () => {
    const db = emptyDb();
    erro(() => addContaPagar(db, {categoria:'Café', valor:'10', vencimento:'2026-10-20'}), 'categoria');
    erro(() => addContaPagar(db, {categoria:'Anúncios', valor:'0', vencimento:'2026-10-20'}), 'valor');
    erro(() => addContaPagar(db, {categoria:'Anúncios', valor:'100'}), 'vencimento');
    assert.equal(addContaPagar(db, {categoria:'Anúncios', valor:'100', vencimento:'2026-10-20', descricao:'Meta Ads'}), 'Conta a pagar registrada.');
    assert.equal(db.moves.length, 0);
    assert.equal(balanco(db, 'tudo', ref).despesas, 0);
    pagarConta(db, db.bills[0].id, '2026-10-12');
    const d = db.moves.find(m => m.tipo === 'despesa');
    assert.deepEqual([d.categoria, d.valor, d.data, d.obs], ['Anúncios', 100, '2026-10-12', 'Meta Ads']);
    const b = balanco(db, 'tudo', ref);
    assert.deepEqual([b.despesas, b.caixaSaiu, b.lucroLiquido], [100, 100, -100]);
  });

  test('desfazer o pagamento remove a despesa gerada', () => {
    const db = emptyDb();
    addContaPagar(db, {categoria:'Frete', valor:'30', vencimento:'2026-10-20'});
    pagarConta(db, db.bills[0].id, '2026-10-12');
    assert.equal(db.moves.length, 1);
    desfazerPagamento(db, db.bills[0].id);
    assert.equal(db.moves.length, 0);
    assert.equal(db.bills[0].status, 'pendente');
  });

  test('parcelar conta avulsa; excluir só avulsa e pendente', () => {
    const db = emptyDb(), p = novoProduto(db);
    assert.equal(addContaPagar(db, {categoria:'Outros', valor:'90', vencimento:'2026-11-05', parcelas:'3'}), '3 parcelas a pagar registradas.');
    assert.deepEqual(db.bills.map(b => b.valor), [30, 30, 30]);
    pagarConta(db, db.bills[0].id);
    erro(() => excluirConta(db, db.bills[0].id), 'Desfaça o pagamento');
    assert.equal(excluirConta(db, db.bills[1].id), 'Conta excluída.');
    assert.equal(excluirConta(db, 'nao'), null);
    entrada(db, p, {condicao:'pagar', vencimento:'2026-11-05'});
    erro(() => excluirConta(db, db.bills.find(b => b.origem === 'entrada').id), 'cancele a venda');
  });

  test('backup antigo sem contas continua abrindo e o caixa não muda', () => {
    const db = parseBackup(JSON.stringify({products:[], units:[], moves:[]}));
    assert.deepEqual(db.bills, []);
    const b = balanco(db, 'tudo', '2026-10-12');
    assert.deepEqual([b.aReceber, b.aPagar, b.caixaEntrou, b.caixaSaiu], [0, 0, 0, 0]);
  });
});


describe('fotos dos produtos', () => {
  test('guarda até 3 fotos por produto e recusa a quarta', () => {
    const db = emptyDb(), p = novoProduto(db);
    assert.equal(MAX_FOTOS, 3);
    assert.equal(adicionarFoto(db, p.id, 'a/1.jpg'), 'Foto adicionada.');
    adicionarFoto(db, p.id, 'a/2.jpg'); adicionarFoto(db, p.id, 'a/3.jpg');
    erro(() => adicionarFoto(db, p.id, 'a/4.jpg'), 'até 3 fotos');
    assert.deepEqual(p.fotos, ['a/1.jpg', 'a/2.jpg', 'a/3.jpg']);
  });

  test('não duplica a mesma foto e exige produto existente', () => {
    const db = emptyDb(), p = novoProduto(db);
    adicionarFoto(db, p.id, 'a/1.jpg');
    assert.equal(adicionarFoto(db, p.id, 'a/1.jpg'), null);
    assert.equal(p.fotos.length, 1);
    erro(() => adicionarFoto(db, 'nao', 'x.jpg'), 'não encontrado');
  });

  test('remover tira só a foto pedida e ignora o que não existe', () => {
    const db = emptyDb(), p = novoProduto(db);
    adicionarFoto(db, p.id, 'a/1.jpg'); adicionarFoto(db, p.id, 'a/2.jpg');
    assert.equal(removerFoto(db, p.id, 'a/1.jpg'), 'Foto removida.');
    assert.deepEqual(p.fotos, ['a/2.jpg']);
    assert.equal(removerFoto(db, p.id, 'a/9.jpg'), null);
    assert.equal(removerFoto(db, 'nao', 'a/2.jpg'), null);
  });

  test('editar o produto não perde as fotos', () => {
    const db = emptyDb(), p = novoProduto(db);
    adicionarFoto(db, p.id, 'a/1.jpg');
    salvarProduto(db, {id:p.id, nome:'Bip 5 Pro', custoPadrao:'210'});
    assert.deepEqual(db.products[0].fotos, ['a/1.jpg']);
  });
});


describe('garantias', () => {
  const ref = '2026-10-12';

  test('prazo: vazio é 90 dias, zero é sem garantia, e só aceita inteiros de 0 a 3650', () => {
    assert.equal(GARANTIA_PADRAO, 90);
    assert.equal(parseDias(''), 90);
    assert.equal(parseDias(undefined), 90);
    assert.equal(parseDias('0'), 0);
    assert.equal(parseDias('30'), 30);
    assert.equal(parseDias('3650'), 3650);
    for(const ruim of ['-1', '1.5', 'abc', '3651']) erro(() => parseDias(ruim), 'número inteiro de dias');
    assert.equal(garantiaAte('2026-10-01', 90), '2026-12-30');
    assert.equal(garantiaAte('2026-10-01', 0), '');
  });

  test('situação: o último dia ainda vale, o dia seguinte venceu', () => {
    assert.deepEqual(situacaoGarantia('2026-10-12', ref), {situacao:'ativa', ate:'2026-10-12', dias:0});
    assert.equal(situacaoGarantia('2026-10-11', ref).situacao, 'vencida');
    assert.equal(situacaoGarantia('2026-10-11', ref).dias, -1);
    assert.equal(situacaoGarantia('', ref).situacao, 'sem');
    assert.equal(situacaoGarantia(undefined, ref).situacao, 'naoRegistrada');
  });

  test('a venda guarda a garantia dada ao cliente (90 dias por padrão)', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3'});
    venda(db, p, {data:'2026-10-01'});
    venda(db, p, {data:'2026-10-01', garantia:'30'});
    venda(db, p, {data:'2026-10-01', garantia:'0'});
    const v = db.moves.filter(m => m.tipo === 'venda');
    assert.deepEqual(v.map(m => [m.garantiaDias, m.garantiaAte]), [[90, '2026-12-30'], [30, '2026-10-31'], [0, '']]);
  });

  test('garantia inválida na venda não grava nada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2'});
    erro(() => venda(db, p, {garantia:'-5'}), 'número inteiro de dias');
    erro(() => venda(db, p, {garantia:'abc'}), 'número inteiro de dias');
    assert.equal(stock(db, p.id), 2);
    assert.equal(db.moves.filter(m => m.tipo === 'venda').length, 0);
  });

  test('a entrada guarda a garantia do fornecedor em cada unidade', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', data:'2026-10-01'});
    entrada(db, p, {qtd:'1', data:'2026-10-01', garantiaForn:'30'});
    entrada(db, p, {qtd:'1', data:'2026-10-01', garantiaForn:'0'});
    assert.deepEqual(db.units.map(u => u.garantiaFornAte), ['2026-12-30', '2026-12-30', '2026-10-31', '']);
    assert.equal(db.moves.filter(m => m.tipo === 'entrada')[1].garantiaFornDias, 30);
    erro(() => entrada(db, p, {garantiaForn:'x'}), 'número inteiro de dias');
    assert.equal(db.units.length, 4);
  });

  test('aparelho comprado antes do recurso usa 90 dias da entrada e é marcado como estimado', () => {
    const antigo = {dataEntrada:'2026-08-01'};                    // sem garantiaFornAte
    const g = garantiaDoFornecedor(antigo, ref);
    assert.deepEqual([g.estimada, g.ate, g.situacao], [true, '2026-10-30', 'ativa']);
    const novo = garantiaDoFornecedor({dataEntrada:'2026-08-01', garantiaFornAte:'2026-09-01'}, ref);
    assert.deepEqual([novo.estimada, novo.situacao], [false, 'vencida']);
    assert.equal(garantiaDoFornecedor({dataEntrada:'2026-08-01', garantiaFornAte:''}, ref).situacao, 'sem');
  });

  test('consulta por série, nome do cliente e telefone; ignora venda cancelada', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarCliente(db, {nome:'Maria Souza', telefone:'(85) 99999-0000'});
    entrada(db, p, {qtd:'4', seriais:'AB123\nAB124\nZZ900\nZZ901', data:'2026-09-01'});
    venda(db, p, {seriais:'AB123', cliente:'Maria Souza', data:'2026-10-01'});
    venda(db, p, {seriais:'AB124', cliente:'João', data:'2026-06-01'});
    venda(db, p, {seriais:'ZZ900', cliente:'Maria Souza', data:'2026-10-05', garantia:'0'});
    venda(db, p, {seriais:'ZZ901', cliente:'Maria Souza', data:'2026-10-06'});
    cancelarVenda(db, db.moves.filter(m => m.tipo === 'venda').at(-1).id);

    const porSerie = consultarGarantia(db, 'ab123', ref);
    assert.deepEqual(porSerie.map(r => [r.cliente, r.garantia.situacao, r.garantia.ate]), [['Maria Souza', 'ativa', '2026-12-30']]);
    assert.deepEqual(consultarGarantia(db, 'AB12', ref).map(r => r.serials[0]), ['AB123', 'AB124']);
    assert.equal(consultarGarantia(db, 'AB124', ref)[0].garantia.situacao, 'vencida');
    assert.deepEqual(consultarGarantia(db, 'maria', ref).map(r => r.serials[0]), ['ZZ900', 'AB123']);   // mais recente primeiro, sem a cancelada
    assert.equal(consultarGarantia(db, 'maria', ref)[0].garantia.situacao, 'sem');
    // o telefone acha as vendas ligadas ao cadastro dela, e não as do João (que não tem cadastro)
    assert.deepEqual(consultarGarantia(db, '99999-0000', ref).map(r => r.cliente), ['Maria Souza', 'Maria Souza']);
    assert.equal(consultarGarantia(db, '(85) 99999', ref).length, 2);
  });

  test('o telefone acha as vendas do cliente cadastrado', () => {
    const db = emptyDb(), p = novoProduto(db);
    salvarCliente(db, {nome:'Ana', telefone:'(85) 98888-1111'});
    entrada(db, p, {qtd:'2'});
    venda(db, p, {cliente:'Ana'});
    venda(db, p, {cliente:'Outra'});
    assert.equal(consultarGarantia(db, '98888-1111', ref).length, 1);
    assert.equal(consultarGarantia(db, '988881111', ref).length, 1);
    assert.equal(consultarGarantia(db, '1111', ref).length, 1);
    assert.equal(consultarGarantia(db, '123', ref).length, 0);
  });

  test('busca curta ou vazia não devolve nada', () => {
    const db = emptyDb();
    assert.deepEqual(consultarGarantia(db, '', ref), []);
    assert.deepEqual(consultarGarantia(db, ' a ', ref), []);
  });

  test('venda antiga, sem garantia registrada, aparece como não registrada', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p);
    venda(db, p, {cliente:'Velho'});
    const m = db.moves.find(x => x.tipo === 'venda');
    delete m.garantiaDias; delete m.garantiaAte;
    assert.equal(consultarGarantia(db, 'velho', ref)[0].garantia.situacao, 'naoRegistrada');
  });

  test('baixa por defeito avisa quando ainda dá para pedir a troca ao fornecedor', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'2', data:'2026-10-01'});
    const msg = addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito', data:'2026-10-12'});
    assert.match(msg, /1 unidade\(s\) ainda na garantia do fornecedor até 30\/12\/2026\. Peça a troca/);
    assert.doesNotMatch(msg, /estimado/);
  });

  test('baixa por outro motivo, ou fora do prazo, não avisa', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'3', data:'2026-01-01'});
    assert.equal(addBaixa(db, {produto:p.id, qtd:'1', motivo:'Perda ou extravio', data:'2026-01-05'}), 'Baixa registrada.');
    assert.equal(addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito', data:'2026-10-12'}), 'Baixa registrada.');   // 90 dias já passaram
    entrada(db, p, {qtd:'1', data:'2026-10-01', garantiaForn:'0'});
    assert.equal(addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito', data:'2026-10-12'}), 'Baixa registrada.');   // fornecedor não deu garantia
  });

  test('aparelho antigo na baixa: o aviso diz que o prazo é estimado', () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {data:'2026-10-01'});
    delete db.units[0].garantiaFornAte;
    assert.match(addBaixa(db, {produto:p.id, qtd:'1', motivo:'Defeito', data:'2026-10-12'}), /prazo estimado em 90 dias/);
  });

  test('alerta de garantia do fornecedor acabando, só para o que está em estoque', () => {
    const db = emptyDb(), a = novoProduto(db, {nome:'A'}), b = novoProduto(db, {nome:'B'}), c = novoProduto(db, {nome:'C'});
    entrada(db, a, {qtd:'2', data:'2026-07-20'});                    // vence em 2026-10-18 (6 dias)
    entrada(db, a, {qtd:'1', data:'2026-07-25'});                    // vence em 2026-10-23 (11 dias)
    entrada(db, b, {qtd:'1', data:'2026-09-01'});                    // vence em 2026-11-30 (fora dos 15 dias)
    entrada(db, c, {qtd:'1', data:'2026-07-01', garantiaForn:'30'}); // já venceu
    const r = garantiasVencendo(db, ref, 15);
    assert.deepEqual(r.map(x => [x.nome, x.qtd, x.ate, x.dias]), [['A', 3, '2026-10-18', 6]]);
    venda(db, a, {qtd:'3', preco:'100'});                            // vendeu tudo: nada mais a devolver
    assert.deepEqual(garantiasVencendo(db, ref, 15), []);
  });
});

describe('Metas do mês', () => {
  const ref = '2026-10-15';
  const comVenda = () => {
    const db = emptyDb(), p = novoProduto(db, {custoPadrao:'100'});
    entrada(db, p, {qtd:'5', custo:'100', data:'2026-10-01'});
    venda(db, p, {qtd:'2', preco:'300', data:'2026-10-10'});          // receita 600, lucro bruto 400
    return db;
  };
  test('valida e salva a meta do mês atual', () => {
    const db = emptyDb();
    erro(() => salvarMeta(db, {vendas:'-5', lucro:''}, ref), 'meta de vendas');
    erro(() => salvarMeta(db, {vendas:'abc', lucro:''}, ref), 'meta de vendas');
    assert.equal(salvarMeta(db, {vendas:'1000', lucro:'400,50'}, ref), 'Metas do mês salvas.');
    assert.deepEqual(db.metas.map(m => [m.id, m.vendas, m.lucro]), [['2026-10', 1000, 400.5]]);
    salvarMeta(db, {vendas:'2000', lucro:''}, ref);                    // salvar de novo troca, não duplica
    assert.deepEqual(db.metas.map(m => [m.vendas, m.lucro]), [[2000, 0]]);
    assert.equal(salvarMeta(db, {vendas:'', lucro:''}, ref), 'Metas do mês removidas.');
    assert.deepEqual(db.metas, []);
  });
  test('progresso usa a receita e o lucro líquido do mês', () => {
    const db = comVenda();
    assert.equal(progressoMetas(db, ref).meta, false);
    salvarMeta(db, {vendas:'1200', lucro:'200'}, ref);
    const m = progressoMetas(db, ref);
    assert.deepEqual([m.vendas.feito, m.vendas.pct, m.vendas.falta], [600, 50, 600]);
    assert.equal(m.lucro.feito, 400);
    assert.equal(m.lucro.pct, 200);                                    // passa de 100%: o texto mostra o real
    assert.equal(m.lucro.falta, 0);
    assert.equal(m.diasRestantes, 16);
  });
  test('sem meta no mês vale a do último mês que teve uma; mês futuro não vale', () => {
    const db = comVenda();
    salvarMeta(db, {vendas:'1000', lucro:''}, '2026-09-20');
    const m = progressoMetas(db, ref);
    assert.equal(m.herdada, true);
    assert.equal(m.vendas.alvo, 1000);
    assert.equal(m.lucro, null);
    assert.equal(progressoMetas(db, '2026-08-15').meta, false);
  });
  test('backup antigo sem metas é aceito', () => {
    const db = parseBackup(JSON.stringify({products:[], units:[], moves:[]}));
    assert.deepEqual(db.metas, []);
  });
});

describe('pagamento parcial de contas', () => {
  const ref = '2026-10-12';
  const aReceber = () => {
    const db = emptyDb(), p = novoProduto(db);
    entrada(db, p, {qtd:'1', custo:'100'});
    venda(db, p, {cliente:'Maria', preco:'300', data:'2026-10-01', recebimento:'receber', vencimento:'2026-10-05', parcelas:'1'});
    return db;
  };

  test('recebe parte: a conta fecha pelo valor recebido e o restante vira outra conta pendente', () => {
    const db = aReceber();
    const id = db.bills[0].id;
    assert.equal(pagarConta(db, id, '2026-10-12', {valor:'100', vencimento:'2026-10-30'}), 'Recebimento parcial registrado. Falta 200,00.');
    const [pg, resto] = db.bills;
    assert.deepEqual([pg.status, pg.valor, pg.valorOriginal, pg.dataPagamento], ['pago', 100, 300, '2026-10-12']);
    assert.deepEqual([resto.status, resto.valor, resto.vencimento, resto.restanteDe, resto.moveId], ['pendente', 200, '2026-10-30', id, pg.moveId]);
    const b = balanco(db, 'tudo', ref);
    assert.equal(b.recebimentos, 100);                       // só o que entrou no caixa
    assert.equal(b.aReceber, 200);
    assert.equal(contas(db, {}, ref).receber, 200);
  });

  test('sem vencimento informado o restante mantém o da original; valor vazio paga tudo', () => {
    const db = aReceber();
    pagarConta(db, db.bills[0].id, '2026-10-12', {valor:'50'});
    assert.equal(db.bills[1].vencimento, '2026-10-05');
    const db2 = aReceber();
    assert.equal(pagarConta(db2, db2.bills[0].id, '2026-10-12', {valor:''}), 'Recebimento registrado.');
    assert.equal(db2.bills.length, 1);
    assert.equal(db2.bills[0].valorOriginal, undefined);
  });

  test('valida o valor e a data do restante antes de gravar', () => {
    const db = aReceber();
    const id = db.bills[0].id;
    erro(() => pagarConta(db, id, '2026-10-12', {valor:'0'}), 'maior que zero');
    erro(() => pagarConta(db, id, '2026-10-12', {valor:'abc'}), 'maior que zero');
    erro(() => pagarConta(db, id, '2026-10-12', {valor:'300,01'}), 'não pode passar');
    erro(() => pagarConta(db, id, '2026-10-12', {valor:'100', vencimento:'30/10'}), 'vencimento do restante');
    assert.deepEqual([db.bills.length, db.bills[0].status, db.bills[0].valor], [1, 'pendente', 300]);
  });

  test('conta avulsa a pagar: a despesa nasce só do valor pago', () => {
    const db = emptyDb();
    addContaPagar(db, {categoria:'Anúncios', valor:'200', vencimento:'2026-10-15', parcelas:'1'});
    pagarConta(db, db.bills[0].id, '2026-10-12', {valor:'80'});
    assert.deepEqual(db.moves.filter(m => m.tipo === 'despesa').map(m => m.valor), [80]);
    pagarConta(db, db.bills[1].id, '2026-10-13');            // o restante (120) paga normalmente
    assert.deepEqual(db.moves.filter(m => m.tipo === 'despesa').map(m => m.valor), [80, 120]);
  });

  test('desfazer volta ao valor original e remove o restante; bloqueia se o restante já foi pago', () => {
    const db = aReceber();
    pagarConta(db, db.bills[0].id, '2026-10-12', {valor:'100'});
    const [primeira, resto] = db.bills;
    pagarConta(db, resto.id, '2026-10-13');
    erro(() => desfazerPagamento(db, primeira.id), 'restante');
    desfazerPagamento(db, resto.id);
    desfazerPagamento(db, primeira.id);
    assert.equal(db.bills.length, 1);
    assert.deepEqual([db.bills[0].status, db.bills[0].valor, db.bills[0].valorOriginal, db.bills[0].restanteId], ['pendente', 300, undefined, undefined]);
  });

  test('cancelar a venda cancela também o restante', () => {
    const db = aReceber();
    pagarConta(db, db.bills[0].id, '2026-10-12', {valor:'100'});
    const msg = cancelarVenda(db, db.moves.find(m => m.tipo === 'venda').id);
    assert.match(msg, /1 parcela\(s\) já tinha/);
    assert.deepEqual(db.bills.map(b => b.status), ['cancelada', 'cancelada']);
  });
});
