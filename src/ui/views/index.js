import painel from './painel.js';
import balanco from './balanco.js';
import contas from './contas.js';
import unidades from './unidades.js';
import produtos from './produtos.js';
import { entradas, vendas, baixas } from './movimentos.js';
import clientes from './clientes.js';
import fornecedores from './fornecedores.js';
import historico from './historico.js';
import dados from './dados.js';

export const TABS = [['painel','Painel'],['balanco','Balanço'],['contas','Contas'],['unidades','Unidades'],['produtos','Produtos'],['entradas','Entradas'],['vendas','Vendas'],['baixas','Baixas'],['clientes','Clientes'],['fornecedores','Fornecedores'],['historico','Histórico'],['dados','Dados']];
export const VIEWS = {painel, balanco, contas, unidades, produtos, entradas, vendas, baixas, clientes, fornecedores, historico, dados};
