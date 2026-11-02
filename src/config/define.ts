import { z } from 'zod/v4';
import type { ConfigDefinition } from '../types';
import { loadConfig, parseConfig } from './load';

/** Env var names per schema instance; a WeakMap keeps the metadata out of JSON Schema output. */
const ENV_BINDINGS = new WeakMap<z.ZodType, readonly string[]>();

/** Env-derived input: strings at leaves, nested sections as objects. */
interface EnvInput {
  readonly [key: string]: string | EnvInput;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Binds a config leaf to an environment variable, or to several where the
 * first one set wins. Pass a fresh schema per call — the binding belongs to
 * the schema instance:
 *
 * ```ts
 * port: fromEnv('HTTP_PORT', z.coerce.number().int().default(3000)),
 * url: fromEnv(['CACHE_URL', 'REDIS_URL'], z.string().min(1)),
 * ```
 */
export function fromEnv<TSchema extends z.ZodType>(names: string | readonly string[], schema: TSchema): TSchema {
  ENV_BINDINGS.set(schema, typeof names === 'string' ? [names] : names);
  return schema;
}

/** A nested section, and whether it may be omitted (optional or defaulted). */
function sectionOf(schema: z.ZodType): { readonly object: z.ZodObject; readonly omittable: boolean } | undefined {
  if (schema instanceof z.ZodObject) return { object: schema, omittable: false };
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    const inner = sectionOf(schema.unwrap() as z.ZodType);
    return inner && { object: inner.object, omittable: true };
  }
  if (schema instanceof z.ZodNullable) return sectionOf(schema.unwrap() as z.ZodType);
  return undefined;
}

/**
 * Builds the schema input from the environment. Required sections are always
 * present so their defaults apply; omittable sections only when one of their
 * variables is set, so an unset optional section stays `undefined`.
 */
function mapSection(object: z.ZodObject, env: Env): { readonly value: EnvInput; readonly found: boolean } {
  const entries = Object.entries(object.shape as Record<string, z.ZodType>).flatMap(
    ([key, field]): [string, string | EnvInput, boolean][] => {
      const names = ENV_BINDINGS.get(field);
      if (names !== undefined) {
        const raw = names.map((name) => env[name]).find((value) => value !== undefined);
        return raw === undefined ? [] : [[key, raw, true]];
      }
      const section = sectionOf(field);
      if (!section) return [];
      const child = mapSection(section.object, env);
      return child.found || !section.omittable ? [[key, child.value, child.found]] : [];
    },
  );
  return {
    value: Object.fromEntries(entries.map(([key, value]) => [key, value])),
    found: entries.some(([, , found]) => found),
  };
}

function envKeysOf(object: z.ZodObject): string[] {
  return Object.values(object.shape as Record<string, z.ZodType>).flatMap((field) => {
    const names = ENV_BINDINGS.get(field);
    if (names !== undefined) return [...names];
    const section = sectionOf(field);
    return section ? envKeysOf(section.object) : [];
  });
}

/**
 * Composes config sections into one validated schema whose environment
 * mapping comes from {@link fromEnv} bindings, so applications never write a
 * hand-maintained `mapEnvironment`:
 *
 * ```ts
 * export const appConfig = defineConfig({
 *   app: z.object({ name: fromEnv('APP_NAME', z.string().default('app')) }),
 *   mail: mailConfigSlice,
 * });
 * export type AppConfig = InferConfig<typeof appConfig>;
 * ```
 */
export function defineConfig<TShape extends z.ZodRawShape>(shape: TShape): ConfigDefinition<TShape> {
  const schema = z.object(shape);
  const mapEnv = (env: Env) => mapSection(schema, env).value as z.input<typeof schema>;
  return {
    schema,
    envKeys: envKeysOf(schema),
    mapEnv,
    parse: (env) => parseConfig(schema, mapEnv(env)),
    load: (options = {}) =>
      loadConfig({
        schema,
        map: mapEnv,
        envFile: options.envFile === false ? undefined : (options.envFile ?? '.env'),
        envFileRequired: options.envFileRequired,
        processEnv: options.processEnv,
      }),
  };
}
