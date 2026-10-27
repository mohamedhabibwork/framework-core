import type { z } from 'zod/v4';
import { ConfigError } from '../errors';
import type { DeepReadonly, LoadConfigOptions } from '../types';
import { mergeEnv, readEnvFile } from './env';

export type { DeepReadonly, LoadConfigOptions } from '../types';

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/**
 * Validates configuration before anything is served. Issues name the failing
 * path only; values are never echoed, so secrets cannot leak through errors.
 */
export async function loadConfig<TSchema extends z.ZodType>(
  options: LoadConfigOptions<TSchema>,
): Promise<DeepReadonly<z.output<TSchema>>> {
  const fileVars = options.envFile
    ? await readEnvFile(options.envFile, { required: options.envFileRequired ?? false })
    : {};
  const env = mergeEnv(fileVars, options.processEnv ?? process.env);
  return parseConfig(options.schema, options.map(env));
}

export function parseConfig<TSchema extends z.ZodType>(
  schema: TSchema,
  input: z.input<TSchema> | Readonly<Record<string, string | undefined>>,
): DeepReadonly<z.output<TSchema>> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`));
  }
  return deepFreeze(result.data);
}
