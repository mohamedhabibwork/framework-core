/**
 * Every constant of `@framework/core` that is not a class or function:
 * dependency-injection tokens and sentinel values.
 */
import { token } from './container/token';
import type { RegisteredConfig } from './register';

/** The application's validated configuration (bound at construction); typed by `Register.config`. */
export const CONFIG = token<RegisteredConfig>('config');

/** Fallback execution-context token; overridden per request/job scope. */
export const EXECUTION_CONTEXT =
  token<import('./context/execution-context').ExecutionContext>('core.execution-context');
