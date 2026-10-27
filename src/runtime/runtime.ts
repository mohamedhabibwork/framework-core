import { AsyncLocalStorage } from 'node:async_hooks';
import { ANONYMOUS_ACTOR, ExecutionContext } from '../context/execution-context';
import { FrameworkError } from '../errors';

/** Context used when nothing is running (scripts, tests, standalone use). */
export const STANDALONE_EXECUTION: ExecutionContext = new ExecutionContext('command', 'standalone', ANONYMOUS_ACTOR);

/**
 * Cross-cutting runtime state readable from anywhere — Laravel-style helper
 * ground truth. The application installs its config at construction; the
 * HTTP kernel and queue worker bind the current execution to the async chain,
 * so helpers see the right actor/correlation id inside requests and jobs.
 */
const executionStorage = new AsyncLocalStorage<ExecutionContext>();

let applicationConfig: object | undefined;

/** Called by the Application constructor; the app's validated, frozen config. */
export function setApplicationConfig(config: object): void {
  applicationConfig = config;
}

/** The booted application's config; helpers like `config()` read from here. */
export function applicationConfigOrThrow(): object {
  if (applicationConfig === undefined) {
    throw new FrameworkError('RUNTIME_NOT_BOOTED', 'No application config is installed; boot an Application first');
  }
  return applicationConfig;
}

/** Runs `work` with `execution` as the ambient context for its whole async chain. */
export function runWithExecution<T>(execution: ExecutionContext, work: () => T): T {
  return executionStorage.run(execution, work);
}

/** The ambient execution context; standalone default outside requests/jobs. */
export function currentExecution(): ExecutionContext {
  return executionStorage.getStore() ?? STANDALONE_EXECUTION;
}
