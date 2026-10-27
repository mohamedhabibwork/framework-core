import { EXECUTION_CONTEXT } from '../constants';
import type { ScopeKind } from '../container/container';
import type { Actor } from '../types';

export type { Actor, ActorType } from '../types';
export { EXECUTION_CONTEXT };

export const ANONYMOUS_ACTOR: Actor = Object.freeze({ id: null, type: 'anonymous' });
export const SYSTEM_ACTOR: Actor = Object.freeze({ id: 'system', type: 'system' });

/**
 * Immutable per-scope context shared by controller, service and repository:
 * who is acting and how the work correlates (request id or job id). One
 * instance is bound per request/job/command scope.
 */
export class ExecutionContext {
  readonly startedAt = new Date();

  constructor(
    readonly kind: ScopeKind,
    readonly correlationId: string,
    readonly actor: Actor = ANONYMOUS_ACTOR,
  ) {}

  /** Returns a new context acting as `actor` (e.g. after authentication). */
  withActor(actor: Actor): ExecutionContext {
    return new ExecutionContext(this.kind, this.correlationId, actor);
  }
}
