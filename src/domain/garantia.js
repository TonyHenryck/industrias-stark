/*
 * Garantias. Dois prazos diferentes:
 *  - da venda: o que você dá ao cliente (campo `garantiaAte` na venda);
 *  - do fornecedor: o que você recebe ao comprar (campo `garantiaFornAte` em cada unidade).
 * Aparelhos comprados antes deste recurso não têm o prazo do fornecedor gravado: usa-se o padrão de
 * 90 dias contados da entrada (o que a XDistribuidora informa) e a tela marca como estimado.
 */
import { fail } from './errors.js';
import { hoje, diasEntre, somaDias, str } from './util.js';

export const GARANTIA_PADRAO = 90;
export const GARANTIA_MAX = 3650;

/** Dias de garantia vindos de um formulário. Vazio = padrão; 0 = sem garantia. */
export function parseDias(valor, padrao = GARANTIA_PADRAO){
  if(valor === undefined || valor === null || str(valor).trim() === '') return padrao;
  const n = Number(valor);
  if(!Number.isInteger(n) || n < 0 || n > GARANTIA_MAX) fail(`A garantia deve ser um número inteiro de dias, de 0 a ${GARANTIA_MAX}.`);
  return n;
}

/** Data final da garantia, ou '' quando não há (0 dias). */
export const garantiaAte = (data, dias) => (dias > 0 ? somaDias(data, dias) : '');

/** {situacao: 'ativa' | 'vencida' | 'sem' | 'naoRegistrada', ate, dias} (dias < 0 depois de vencida). */
export function situacaoGarantia(ate, ref = hoje()){
  if(ate === undefined) return {situacao:'naoRegistrada', ate:'', dias:0};
  if(!ate) return {situacao:'sem', ate:'', dias:0};
  const dias = diasEntre(ref, ate);
  return {situacao: dias >= 0 ? 'ativa' : 'vencida', ate, dias};
}

export const garantiaDaVenda = (venda, ref) => situacaoGarantia(venda?.garantiaAte, ref);

/** Garantia do fornecedor de uma unidade; `estimada` quando veio do padrão e não de um prazo registrado. */
export function garantiaDoFornecedor(unidade, ref){
  const estimada = unidade.garantiaFornAte === undefined;
  const ate = estimada ? garantiaAte(unidade.dataEntrada, GARANTIA_PADRAO) : unidade.garantiaFornAte;
  return {...situacaoGarantia(ate, ref), estimada};
}
