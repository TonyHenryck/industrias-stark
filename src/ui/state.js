import { emptyDb } from '../domain/queries.js';

/** Estado da interface. `db` é substituído por inteiro ao importar um backup. */
export const state = {
  db: emptyDb(),
  view: 'painel',
  editId: null,
  editCliente: null,
  editFornecedor: null,
  verCliente: null,
  periodo: 'tudo',
  metrica: 'receita',
  contaTipo: 'todas',
  contaStatus: 'pendentes',
  confirmImport: false,
  fUnit: {st:'disponivel', pid:'', q:''},
  fHist: {tipo:'', pid:'', q:''},
  fCliente: {q:''},
};
