import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDb, stock, avgCost, situacao, units } from '../src/domain/queries.js';
import { DomainError } from '../src/domain/errors.js';
import { salvarProduto, excluirProduto, addEntrada, addVenda, cancelarVenda, addBaixa, parseBackup, importarCatalogo } from '../src/domain/operations.js';
import { resumo, expText } from '../src/domain/reports.js';

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
