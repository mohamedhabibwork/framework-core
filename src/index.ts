// Public API of @framework/core.
// Convention: every interface/type lives in `./types`, every constant in
// `./constants`; runtime values (classes, functions) stay in their modules.
export { Application } from './application';
export { codesForStatus, ERROR_CATALOG, ERROR_CODES, ERROR_STATUSES } from './catalog';
export { mergeEnv, parseEnvFile, readEnvFile } from './config/env';
export { deepFreeze, loadConfig, parseConfig } from './config/load';
export { isSecretKey, REDACTED, redact, redactUrl } from './config/redact';
export { CONFIG, EXECUTION_CONTEXT } from './constants';
export { Container, Scope } from './container/container';
export { token } from './container/token';
export { ANONYMOUS_ACTOR, ExecutionContext, SYSTEM_ACTOR } from './context/execution-context';
export { BootError, ConfigError, FrameworkError, ResolutionError } from './errors';
export { installGracefulShutdown } from './lifecycle/signals';
export { Pipeline, pipeline } from './pipeline';
export { orderProviders } from './providers/order';
export { defineProvider } from './providers/provider';
export {
  applicationConfigOrThrow,
  currentExecution,
  runWithExecution,
  STANDALONE_EXECUTION,
  setApplicationConfig,
} from './runtime/runtime';

// Every interface and type alias, in one import point.
export type {
  Actor,
  ActorType,
  ApplicationOptions,
  ApplicationState,
  BindingOptions,
  DeepReadonly,
  ErrorCode,
  ErrorStatus,
  GracefulShutdownOptions,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Lifetime,
  LoadConfigOptions,
  Next,
  Pipe,
  ProviderContext,
  Resolver,
  ScopeKind,
  ServiceProvider,
  ServiceValue,
  Token,
  TokenType,
} from './types';
