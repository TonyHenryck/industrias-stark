import { esc, brl, opt, badge, fmtDate } from '../format.js';
import { contas } from '../../domain/reports.js';
import { CATEGORIAS_DESPESA } from '../../domain/constants.js';
import { hoje, somaMeses } from '../../domain/util.js';
import { datalist } from '../shared.js';

const kpi = (l, v, s = '', cls = '') => `<div class="kpi"><span>${l}</span><strong class="${cls}">${v}</strong>${s ? `<small>${s}</small>` : ''}</div>`;

const SITUACAO = {
  pago:    () => badge('Paga', 'ok'),
  vencida: () => badge('Vencida', 'bad'),
  hoje:    () => badge('Vence hoje', 'warn'),
  aVencer: () => badge('A vencer'),
};

function linha(c, parcial){
  const parcela = c.parcelas > 1 ? ` · parcela ${c.parcela}/${c.parcelas}` : '';
  const acoes = c.status === 'pago'
    ? `<button class="btn small" data-act="desfazerC" data-id="${c.id}">Desfazer</button>`
    : `<button class="btn small primary" data-act="pagarC" data-id="${c.id}">${c.tipo === 'receber' ? 'Receber' : 'Pagar'}</button>
       <button class="btn small" data-act="parcialC" data-id="${c.id}" aria-expanded="${parcial === c.id}">Parcial</button>
       ${c.origem === 'manual' ? `<button class="btn small" data-act="delConta" data-id="${c.id}">Excluir</button>` : ''}`;
  const restante = c.restanteDe ? ' · restante' : '';
  const original = c.valorOriginal ? `<small class="sub" style="display:block">de ${brl(c.valorOriginal)}</small>` : '';
  const aberto = parcial === c.id && c.status !== 'pago' ? `<tr class="linha-form"><td colspan="6">
      <form data-form="pagamentoParcial" class="form">
        <input type="hidden" name="id" value="${c.id}">
        <label>Valor ${c.tipo === 'receber' ? 'recebido' : 'pago'} (R$)*<input name="valor" type="number" step="0.01" min="0.01" max="${c.valor}" required placeholder="Falta ${brl(c.valor)}"></label>
        <label>Data*<input name="data" type="date" required value="${hoje()}"></label>
        <label>Restante vence em<input name="vencimento" type="date" value="${c.vencimento}"></label>
        <div class="actions" style="align-items:flex-end"><button class="btn primary" type="submit">Registrar</button><button class="btn" type="button" data-act="parcialC" data-id="${c.id}">Cancelar</button></div>
      </form></td></tr>` : '';
  return `<tr>
    <td>${fmtDate(c.status === 'pago' ? c.dataPagamento : c.vencimento)}</td>
    <td>${c.tipo === 'receber' ? badge('A receber', 'ok') : badge('A pagar', 'bad')}</td>
    <td style="white-space:normal;min-width:200px">${esc(c.descricao)}${parcela}${restante}${c.parte ? `<small class="sub" style="display:block">${esc(c.parte)}</small>` : ''}</td>
    <td class="r">${brl(c.valor)}${original}</td><td>${SITUACAO[c.situacao]()}</td><td><div class="acts">${acoes}</div></td></tr>${aberto}`;
}

export default ({db, contaTipo, contaStatus, parcial}) => {
  const c = contas(db, {tipo: contaTipo, status: contaStatus});
  const seg = (v, l) => `<button type="button" class="${contaTipo === v ? 'on' : ''}" data-act="contaTipo" data-v="${v}" aria-pressed="${contaTipo === v}">${l}</button>`;
  const tabela = c.lista.length ? `<div class="tbl"><table>
    <thead><tr><th>${contaStatus === 'pagas' ? 'Pago em' : 'Vencimento'}</th><th>Tipo</th><th>Descrição</th><th class="r">Valor</th><th>Situação</th><th></th></tr></thead>
    <tbody>${c.lista.map(x => linha(x, parcial)).join('')}</tbody></table></div>`
    : `<p class="empty">${contaStatus === 'pagas' ? 'Nenhuma conta paga ainda.' : 'Nenhuma conta pendente. Venda "a receber" ou entrada "a pagar" aparecem aqui.'}</p>`;

  return `
  <div class="kpis">
    ${kpi('A receber', brl(c.receber), c.vencidoReceber ? `Vencido ${brl(c.vencidoReceber)}` : 'Nada vencido')}
    ${kpi('A pagar', brl(c.pagar), c.vencidoPagar ? `Vencido ${brl(c.vencidoPagar)}` : 'Nada vencido')}
    ${kpi('Receber em 7 dias', brl(c.receber7))}
    ${kpi('Pagar em 7 dias', brl(c.pagar7))}
  </div>
  <section class="card">
    <div class="card-head"><h2>Contas</h2>
      <div class="actions">
        <div class="seg" role="group" aria-label="Tipo de conta">${seg('todas', 'Todas')}${seg('receber', 'A receber')}${seg('pagar', 'A pagar')}</div>
        <select id="contaStatus" aria-label="Situação">${opt('pendentes', 'Pendentes', contaStatus)}${opt('pagas', 'Pagas', contaStatus)}${opt('todas', 'Todas', contaStatus)}</select>
      </div>
    </div>
    ${tabela}
  </section>
  <section class="card">
    <h2>Nova conta a pagar</h2>
    <p class="hint">Para despesas que vencem depois (anúncios, frete, taxas). Quando você marcar como paga, ela vira despesa na data do pagamento. Compras de produto a prazo são lançadas em Entradas.</p>
    <form data-form="conta" class="form">
      <label>Descrição<input name="descricao" placeholder="Ex.: Anúncios da semana"></label>
      <label>Categoria*<select name="categoria" required>${CATEGORIAS_DESPESA.map(x => opt(x, x, '')).join('')}</select></label>
      <label>Valor total (R$)*<input name="valor" type="number" step="0.01" min="0.01" required></label>
      <label>Primeiro vencimento*<input name="vencimento" type="date" required value="${somaMeses(hoje(), 0)}"></label>
      <label>Parcelas<input name="parcelas" type="number" min="1" max="12" value="1"></label>
      <label>Fornecedor ou cobrança de<input name="parte" list="listaFornecedores" autocomplete="off">${datalist('listaFornecedores', db.suppliers)}</label>
      <label class="wide">Observações<input name="obs"></label>
      <div class="actions wide"><button class="btn primary" type="submit">Registrar conta a pagar</button></div>
    </form>
  </section>`;
};
