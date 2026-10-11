/** Erro de regra de negócio: a mensagem é própria para mostrar ao usuário. */
export class DomainError extends Error {
  constructor(message){ super(message); this.name = 'DomainError'; }
}
export const fail = msg => { throw new DomainError(msg); };
