/**
 * Every constant of `@framework/core` that is not a class or function:
 * dependency-injection tokens and sentinel values.
 */
import { token } from './container/token';

/** The application's validated configuration (bound at construction). */
export const CONFIG = token<object>('config');

/** Fallback execution-context token; overridden per request/job scope. */
export const EXECUTION_CONTEXT =
  token<import('./context/execution-context').ExecutionContext>('core.execution-context');
