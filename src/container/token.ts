import type { ServiceValue, Token } from '../types';

export type { Token, TokenType } from '../types';

/** Creates a typed dependency token (phantom `__type` never exists at runtime). */
export const token = <T extends ServiceValue = ServiceValue>(name: string): Token<T> => ({ key: Symbol(name), name });
