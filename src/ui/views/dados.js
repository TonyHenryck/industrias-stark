import { esc } from '../format.js';
import { expText } from '../../domain/reports.js';

export default ({db}) => `
  <section class="card">
    <h2>Exportar</h2>
    <p class="hint">Copie o texto abaixo e cole em uma planilha (CSV) ou guarde como backup (JSON).</p>
    <div class="filters">
      <select id="expFmt"><option value="csv">Histórico em CSV (abre no Excel)</option><option value="json">Backup completo em JSON</option></select>
      <button class="btn" data-act="copy" style="flex:0 0 auto">Copiar</button>
    </div>
    <textarea id="exp" rows="8" readonly class="mono">${esc(expText(db, 'csv'))}</textarea>
  </section>
  <section class="card">
    <h2>Importar backup</h2>
    <p class="hint">Cole um backup JSON gerado aqui. Isso substitui todos os dados atuais.</p>
    <textarea id="imp" rows="5" placeholder="Cole o JSON aqui"></textarea>
    <div class="actions" style="margin-top:8px"><button class="btn" data-act="importar">Importar e substituir</button></div>
  </section>`;
