/**
 * Every interface and type alias of `@framework/core`, in one place.
 * Runtime values (classes, tokens, functions) live in their own modules;
 * this file is type-only, so importing from it never emits runtime code.
 * Owning modules re-export these for backward compatibility.
 */

// -- JSON --------------------------------------------------------------------

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/** Every runtime kind a container-managed service can be. */
export type ServiceValue = object | string | number | boolean | bigint | symbol | null | undefined;

// -- Application --------------------------------------------------------------

export type ApplicationState = 'created' | 'booting' | 'booted' | 'shutting-down' | 'stopped' | 'failed';

export interface ApplicationOptions<TConfig extends object> {
  readonly config: TConfig;
  readonly providers: readonly ServiceProvider<TConfig>[];
}

// -- Configuration ------------------------------------------------------------

/** Recursive immutable view of a value (frozen configuration). */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends Date
    ? T
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface LoadConfigOptions<TSchema extends z.ZodType> {
  /** Schema describing resolved configuration. Defaults live in the schema. */
  schema: TSchema;
  /** Maps the merged environment into the schema's input shape. */
  map: (env: Readonly<Record<string, string>>) => z.input<TSchema>;
  envFile?: string;
  envFileRequired?: boolean;
  processEnv?: Record<string, string | undefined>;
}

/** Options for {@link ConfigDefinition.load}. */
export interface DefineConfigLoadOptions {
  /** Env file to read; `false` skips it. Defaults to `.env` in the working directory. */
  readonly envFile?: string | false;
  readonly envFileRequired?: boolean;
  /** Defaults to `process.env`; wins over the env file. */
  readonly processEnv?: Record<string, string | undefined>;
}

/** What `defineConfig` returns: the composed schema plus its env-derived loaders. */
export interface ConfigDefinition<TShape extends z.ZodRawShape> {
  readonly schema: z.ZodObject<TShape>;
  /** Every variable bound with `fromEnv`, in shape order (for `.env.example` and docs). */
  readonly envKeys: readonly string[];
  /** The schema input derived from an environment, before validation. */
  mapEnv(env: Readonly<Record<string, string | undefined>>): z.input<z.ZodObject<TShape>>;
  /** Validate an environment into the frozen config. */
  parse(env: Readonly<Record<string, string | undefined>>): DeepReadonly<z.output<z.ZodObject<TShape>>>;
  /** Read the env file, merge the process env over it, and validate. */
  load(options?: DefineConfigLoadOptions): Promise<DeepReadonly<z.output<z.ZodObject<TShape>>>>;
}

/** The frozen config type a `defineConfig` definition produces. */
export type InferConfig<TDefinition> =
  TDefinition extends ConfigDefinition<infer TShape> ? DeepReadonly<z.output<z.ZodObject<TShape>>> : never;

// -- Container ----------------------------------------------------------------

export type Lifetime = 'singleton' | 'scoped' | 'transient';
export type ScopeKind = 'request' | 'job' | 'command' | 'workflow' | 'test';

/** Read-only view handed to factories; resolves within the caller's lifetime rules. */
export interface Resolver {
  resolve<T extends ServiceValue>(token: Token<T>): T;
  has(token: Token<ServiceValue>): boolean;
}

export interface BindingOptions<T extends ServiceValue> {
  lifetime?: Lifetime;
  dispose?: (instance: T) => void | Promise<void>;
}

export interface Token<T> {
  readonly key: symbol;
  readonly name: string;
  readonly __type?: T;
}

export type TokenType<TToken> = TToken extends Token<infer T> ? T : never;

/** `Container.extend` decorator: wraps the effective instance inside the same resolution. */
export type Extender<T extends ServiceValue> = (instance: T, resolver: Resolver) => T;

// -- Providers ----------------------------------------------------------------

export interface ProviderContext<TConfig extends object = object> {
  readonly container: Container;
  readonly config: TConfig;
}

export type ServiceProvider<TConfig extends object = object> = {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  /** Tokens this provider binds; providers requiring them are ordered after it. */
  readonly provides?: readonly Token<ServiceValue>[];
  /** Tokens that must be bound (by a provider or the app) before boot, else boot fails. */
  readonly requires?: readonly Token<ServiceValue>[];
  /** Tokens used when present (`container.has`); only affect ordering. */
  readonly optional?: readonly Token<ServiceValue>[];
  /** Deferred providers skip `boot`; `shutdown` runs only when a provided token was resolved. */
  readonly deferred?: { readonly provides: readonly Token<ServiceValue>[] };
  register(context: ProviderContext<TConfig>): void;
  boot?(context: ProviderContext<TConfig>): void | Promise<void>;
  shutdown?(context: ProviderContext<TConfig>): void | Promise<void>;
};

// -- Execution context --------------------------------------------------------

export type ActorType = 'user' | 'service' | 'system' | 'anonymous';

export interface Actor {
  readonly id: string | null;
  readonly type: ActorType;
}

// -- Lifecycle ----------------------------------------------------------------

export interface GracefulShutdownOptions {
  /** Hard deadline after which the process exits with code 1. */
  readonly timeoutMs: number;
  readonly onShutdown: (signal: string) => Promise<void>;
  readonly log?: (message: string) => void;
  readonly signals?: readonly NodeJS.Signals[];
}

// -- Health -------------------------------------------------------------------

export interface HealthCheckOptions {
  /** Per-probe deadline; overrides the runner's default. */
  readonly timeoutMs?: number;
}

/** One readiness probe. A throw or a timeout marks it `failed`; the error is never exposed. */
export interface HealthCheck extends HealthCheckOptions {
  readonly name: string;
  probe(resolver: Resolver): Promise<void>;
}

export type HealthStatus = 'ok' | 'failed';

// -- Error catalog (owned by ./catalog) --------------------------------------

export type { ErrorCode, ErrorStatus } from './catalog';

// -- Pipelines (in-process) -----------------------------------------------------

/** Continuation handed to a pipe: run the rest of the chain on a payload. */
export type Next<P> = (payload: P) => P | Promise<P>;

/** One step of an in-process pipeline: a function or an object with `handle`. */
export type Pipe<P> =
  | ((payload: P, next: Next<P>) => P | Promise<P>)
  | { handle(payload: P, next: Next<P>): P | Promise<P> };

import type { z } from 'zod/v4';
// Internal imports for the definitions above (type-only, erased at runtime).
import type { Container } from './container/container';
