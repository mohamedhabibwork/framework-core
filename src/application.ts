import { randomUUID } from 'node:crypto';
import { CONFIG } from './constants';
import { Container, type Scope, type ScopeKind } from './container/container';
import { EXECUTION_CONTEXT, ExecutionContext, SYSTEM_ACTOR } from './context/execution-context';
import { BootError, FrameworkError } from './errors';
import { orderProviders } from './providers/order';
import type { ProviderContext, ServiceProvider } from './providers/provider';
import { setApplicationConfig } from './runtime/runtime';
import type { ApplicationOptions, ApplicationState } from './types';

export type { ApplicationOptions, ApplicationState } from './types';
export { CONFIG };

/**
 * Lifecycle: register all bindings -> boot providers in dependency order ->
 * serve scopes -> shutdown in reverse order -> dispose container.
 */
export class Application<TConfig extends object = object> {
  readonly container = new Container();
  readonly config: TConfig;
  readonly #providers: ServiceProvider<TConfig>[];
  readonly #booted: ServiceProvider<TConfig>[] = [];
  #state: ApplicationState = 'created';

  constructor(options: ApplicationOptions<TConfig>) {
    this.config = options.config;
    this.#providers = orderProviders(options.providers);
    this.container.value(CONFIG, options.config);
    // Helpers (`config()` etc.) read the app's config from the runtime.
    setApplicationConfig(options.config);
    // Fallback execution context so every scope can resolve it; the HTTP and
    // job runners override it with the request/job id and the real actor.
    this.container.scoped(EXECUTION_CONTEXT, () => new ExecutionContext('command', randomUUID(), SYSTEM_ACTOR));
  }

  get state(): ApplicationState {
    return this.#state;
  }

  get providerNames(): readonly string[] {
    return this.#providers.map((provider) => provider.name);
  }

  #context(): ProviderContext<TConfig> {
    return { container: this.container, config: this.config };
  }

  async boot(): Promise<this> {
    if (this.#state !== 'created') {
      throw new FrameworkError('INVALID_STATE', `Cannot boot application in state "${this.#state}"`);
    }
    this.#state = 'booting';
    const context = this.#context();
    let current = '(register)';
    try {
      for (const provider of this.#providers) {
        current = provider.name;
        provider.register(context);
      }
      for (const provider of this.#providers) {
        if (provider.deferred) continue;
        current = provider.name;
        await provider.boot?.(context);
        this.#booted.push(provider);
      }
    } catch (error) {
      this.#state = 'failed';
      const teardownError = await this.#teardown().then(
        () => undefined,
        (failure: Error) => failure,
      );
      const bootError = new BootError(current, error);
      if (teardownError) Object.assign(bootError, { teardownError });
      throw bootError;
    }
    this.#state = 'booted';
    return this;
  }

  createScope(kind: ScopeKind): Scope {
    if (this.#state !== 'booted') {
      throw new FrameworkError('INVALID_STATE', `Cannot create a scope while application is "${this.#state}"`);
    }
    return this.container.createScope(kind);
  }

  /** Runs `work` inside a fresh scope that is always disposed. */
  async withScope<T>(kind: ScopeKind, work: (scope: Scope) => Promise<T> | T): Promise<T> {
    const scope = this.createScope(kind);
    try {
      return await work(scope);
    } finally {
      await scope.dispose();
    }
  }

  async shutdown(): Promise<void> {
    if (this.#state === 'stopped' || this.#state === 'shutting-down') return;
    this.#state = 'shutting-down';
    try {
      await this.#teardown();
    } finally {
      this.#state = 'stopped';
    }
  }

  async #teardown(): Promise<void> {
    const failures: Error[] = [];
    const activatedDeferred = this.#providers.filter(
      (p) => p.deferred?.provides.some((t) => this.container.isResolved(t)) ?? false,
    );
    const toStop = [...this.#booted, ...activatedDeferred].reverse();
    this.#booted.length = 0;
    const context = this.#context();
    for (const provider of toStop) {
      try {
        await provider.shutdown?.(context);
      } catch (error) {
        failures.push(
          new FrameworkError('PROVIDER_SHUTDOWN_FAILED', `Provider "${provider.name}" failed to shut down`, {
            cause: error,
          }),
        );
      }
    }
    try {
      await this.container.dispose();
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Application shutdown completed with errors');
  }
}
