import { FrameworkError, ResolutionError } from '../errors';
import type { BindingOptions, Lifetime, Resolver, ScopeKind, ServiceValue } from '../types';
import type { Token } from './token';

export type { BindingOptions, Lifetime, Resolver, ScopeKind } from '../types';

interface Binding<T extends ServiceValue> {
  readonly token: Token<T>;
  readonly factory: (resolver: Resolver) => T;
  readonly lifetime: Lifetime;
  readonly dispose?: (instance: T) => void | Promise<void>;
}

interface Disposable {
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

type Cache = Map<symbol, ServiceValue>;

async function disposeAll(disposables: Disposable[]): Promise<void> {
  const failures: Error[] = [];
  for (const entry of [...disposables].reverse()) {
    try {
      await entry.run();
    } catch (error) {
      failures.push(new FrameworkError('DISPOSE_FAILED', `Failed to dispose "${entry.name}"`, { cause: error }));
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'One or more services failed to dispose');
}

/**
 * Root container. Holds bindings and singleton instances. Scoped services are
 * only resolvable through a {@link Scope}; singletons may never capture them.
 */
export class Container implements Resolver {
  readonly #bindings = new Map<symbol, Binding<ServiceValue>>();
  readonly #singletons: Cache = new Map();
  readonly #disposables: Disposable[] = [];
  #disposed = false;

  bind<T extends ServiceValue>(
    token: Token<T>,
    factory: (resolver: Resolver) => T,
    options: BindingOptions<T> = {},
  ): this {
    if (this.#bindings.has(token.key)) {
      throw new FrameworkError('DUPLICATE_BINDING', `Token "${token.name}" is already bound`);
    }
    this.#bindings.set(token.key, {
      token,
      factory,
      lifetime: options.lifetime ?? 'singleton',
      dispose: options.dispose,
    } as Binding<ServiceValue>);
    return this;
  }

  singleton<T extends ServiceValue>(
    token: Token<T>,
    factory: (r: Resolver) => T,
    dispose?: (instance: T) => void | Promise<void>,
  ): this {
    return this.bind(token, factory, { lifetime: 'singleton', dispose });
  }

  scoped<T extends ServiceValue>(
    token: Token<T>,
    factory: (r: Resolver) => T,
    dispose?: (instance: T) => void | Promise<void>,
  ): this {
    return this.bind(token, factory, { lifetime: 'scoped', dispose });
  }

  transient<T extends ServiceValue>(token: Token<T>, factory: (r: Resolver) => T): this {
    return this.bind(token, factory, { lifetime: 'transient' });
  }

  /** Bind an already-constructed value as a singleton. */
  value<T extends ServiceValue>(token: Token<T>, instance: T): this {
    return this.bind(token, () => instance, { lifetime: 'singleton' });
  }

  has(token: Token<ServiceValue>): boolean {
    return this.#bindings.has(token.key);
  }

  isResolved(token: Token<ServiceValue>): boolean {
    return this.#singletons.has(token.key);
  }

  resolve<T extends ServiceValue>(token: Token<T>): T {
    return this.resolveInternal(token, null, []);
  }

  createScope(kind: ScopeKind): Scope {
    this.#assertOpen();
    return new Scope(this, kind);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await disposeAll(this.#disposables);
  }

  /** @internal */
  resolveInternal<T extends ServiceValue>(
    token: Token<T>,
    scope: Scope | null,
    path: readonly string[],
    keys: readonly symbol[] = [],
  ): T {
    this.#assertOpen();
    const nextPath = [...path, token.name];
    // Cycles compare token identity (symbols); names are only for the message.
    if (keys.includes(token.key)) {
      throw new ResolutionError('DEPENDENCY_CYCLE', 'Circular dependency detected', nextPath);
    }
    const override = scope?.overrideFor(token);
    if (override?.found) return override.value as T;

    const binding = this.#bindings.get(token.key) as Binding<T> | undefined;
    if (!binding) throw new ResolutionError('UNBOUND_TOKEN', `No binding for "${token.name}"`, nextPath);

    switch (binding.lifetime) {
      case 'singleton':
        return this.#cached(binding, this.#singletons, this.#disposables, null, nextPath, [...keys, token.key]);
      case 'scoped':
        if (!scope) {
          throw new ResolutionError(
            'SCOPE_REQUIRED',
            `Scoped service "${token.name}" cannot be resolved outside a scope or from a singleton`,
            nextPath,
          );
        }
        return this.#cached(binding, scope.cache, scope.disposables, scope, nextPath, [...keys, token.key]);
      case 'transient':
        return binding.factory(this.#resolverFor(scope, nextPath, [...keys, token.key]));
    }
  }

  #cached<T extends ServiceValue>(
    binding: Binding<T>,
    cache: Cache,
    disposables: Disposable[],
    scope: Scope | null,
    path: readonly string[],
    keys: readonly symbol[],
  ): T {
    if (cache.has(binding.token.key)) return cache.get(binding.token.key) as T;
    const instance = binding.factory(this.#resolverFor(scope, path, keys));
    cache.set(binding.token.key, instance);
    const dispose = binding.dispose;
    if (dispose) disposables.push({ name: binding.token.name, run: () => dispose(instance) });
    return instance;
  }

  #resolverFor(scope: Scope | null, path: readonly string[], keys: readonly symbol[]): Resolver {
    return {
      resolve: <U extends ServiceValue>(t: Token<U>) => this.resolveInternal(t, scope, path, keys),
      has: (t) => (scope ? scope.has(t) : this.has(t)),
    };
  }

  #assertOpen(): void {
    if (this.#disposed) throw new FrameworkError('CONTAINER_DISPOSED', 'Container has been disposed');
  }
}

/** Execution scope (request, job, command). Owns scoped instances and their disposal. */
export class Scope implements Resolver {
  /** @internal */ readonly cache: Cache = new Map();
  /** @internal */ readonly disposables: Disposable[] = [];
  readonly #overrides = new Map<symbol, ServiceValue>();
  #disposed = false;

  constructor(
    readonly container: Container,
    readonly kind: ScopeKind,
  ) {}

  resolve<T extends ServiceValue>(token: Token<T>): T {
    if (this.#disposed) throw new FrameworkError('SCOPE_DISPOSED', `Scope "${this.kind}" has been disposed`);
    return this.container.resolveInternal(token, this, []);
  }

  has(token: Token<ServiceValue>): boolean {
    return this.#overrides.has(token.key) || this.container.has(token);
  }

  /** Replace a binding for this scope only (tests, per-request values). */
  override<T extends ServiceValue>(token: Token<T>, value: T): this {
    this.#overrides.set(token.key, value);
    return this;
  }

  /** @internal */
  overrideFor(token: Token<ServiceValue>): { found: boolean; value?: ServiceValue } {
    return this.#overrides.has(token.key) ? { found: true, value: this.#overrides.get(token.key) } : { found: false };
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await disposeAll(this.disposables);
  }
}
