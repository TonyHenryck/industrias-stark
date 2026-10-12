import painel from './painel.js';
import balanco from './balanco.js';
import unidades from './unidades.js';
import produtos from './produtos.js';
import { entradas, vendas, baixas } from './movimentos.js';
import historico from './historico.js';
import dados from './dados.js';

export const TABS = [['painel','Painel'],['balanco','Balanço'],['unidades','Unidades'],['produtos','Produtos'],['entradas','Entradas'],['vendas','Vendas'],['baixas','Baixas'],['historico','Histórico'],['dados','Dados']];
export const VIEWS = {painel, balanco, unidades, produtos, entradas, vendas, baixas, historico, dados};
