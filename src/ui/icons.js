const icon = inner => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

/** Ícones das abas (traço simples, herdam a cor do texto). */
export const ICONS = {
  painel:    icon('<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>'),
  unidades:  icon('<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>'),
  produtos:  icon('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>'),
  entradas:  icon('<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v3h16v-3"/>'),
  vendas:    icon('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  baixas:    icon('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
  historico: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  dados:     icon('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
};

/**
 * Monograma provisório "S". Troque pelo logo da Indústrias Stark quando houver.
 * `id` evita colisão do gradiente quando o logo aparece em dois lugares da página.
 */
export const logo = id => `<svg viewBox="0 0 48 48" role="img" aria-label="Indústrias Stark">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#c026d3"/></linearGradient></defs>
  <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#${id})"/>
  <path d="M31 16c-1.7-1.6-4-2.4-6.6-2.4-4 0-6.9 2-6.9 4.9 0 6.9 13.5 3.7 13.5 10.7 0 3.1-3 5.3-7.2 5.3-3 0-5.5-1-7.3-2.9" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
</svg>`;
