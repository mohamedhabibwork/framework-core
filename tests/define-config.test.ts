import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod/v4';
import { ConfigError, defineConfig, fromEnv } from '../src';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const appConfig = () =>
  defineConfig({
    app: z.object({
      name: fromEnv('APP_NAME', z.string().min(1).default('framework-app')),
      debug: fromEnv('APP_DEBUG', booleanString.default(false)),
    }),
    http: z.object({
      port: fromEnv('HTTP_PORT', z.coerce.number().int().default(3000)),
      throttle: z.object({ limit: fromEnv('HTTP_THROTTLE_LIMIT', z.coerce.number().int().default(120)) }),
    }),
    notifications: z.object({
      push: z
        .object({
          type: fromEnv('NOTIFICATIONS_PUSH_TYPE', z.string().min(1)),
          target: fromEnv('NOTIFICATIONS_PUSH_TARGET', z.string().optional()),
        })
        .optional(),
    }),
  });

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('defineConfig', () => {
  test('maps declared env vars into nested sections and lets schema defaults fill the rest', async () => {
    const config = await appConfig().load({ envFile: false, processEnv: { APP_NAME: 'acme', HTTP_PORT: '8080' } });

    const port: number = config.http.port;
    expect(port).toBe(8080);
    expect(config).toEqual({
      app: { name: 'acme', debug: false },
      http: { port: 8080, throttle: { limit: 120 } },
      notifications: {},
    });
  });

  test('includes an optional section only when one of its env vars is set', () => {
    const definition = appConfig();
    expect(definition.parse({}).notifications.push).toBeUndefined();
    expect(definition.parse({ NOTIFICATIONS_PUSH_TYPE: 'fcm' }).notifications.push).toEqual({ type: 'fcm' });
  });

  test('process env wins over the env file, which wins over defaults', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'define-config-'));
    tempDirs.push(dir);
    const envFile = join(dir, '.env');
    await writeFile(envFile, 'APP_NAME=from-file\nHTTP_PORT=9000\n');

    const config = await appConfig().load({ envFile, processEnv: { APP_NAME: 'from-process' } });

    expect(config.app.name).toBe('from-process');
    expect(config.http.port).toBe(9000);
    expect(config.http.throttle.limit).toBe(120);
  });

  test('lists every declared env var in shape order', () => {
    expect(appConfig().envKeys).toEqual([
      'APP_NAME',
      'APP_DEBUG',
      'HTTP_PORT',
      'HTTP_THROTTLE_LIMIT',
      'NOTIFICATIONS_PUSH_TYPE',
      'NOTIFICATIONS_PUSH_TARGET',
    ]);
  });

  test('a leaf bound to several env vars takes the first one set and lists them all', () => {
    const definition = defineConfig({
      cache: z.object({ url: fromEnv(['CACHE_URL', 'REDIS_URL'], z.string().default('redis://default')) }),
    });

    expect(definition.parse({ CACHE_URL: 'redis://cache', REDIS_URL: 'redis://shared' }).cache.url).toBe(
      'redis://cache',
    );
    expect(definition.parse({ REDIS_URL: 'redis://shared' }).cache.url).toBe('redis://shared');
    expect(definition.parse({}).cache.url).toBe('redis://default');
    expect(definition.envKeys).toEqual(['CACHE_URL', 'REDIS_URL']);
  });

  test('validation errors name the path, never the value', () => {
    const definition = defineConfig({
      database: z.object({ url: fromEnv('DATABASE_URL', z.url({ protocol: /^postgres$/ })) }),
    });

    expect(() => definition.parse({})).toThrow(ConfigError);
    try {
      definition.parse({ DATABASE_URL: 'mysql://user:hunter2@db/app' });
      throw new Error('expected failure');
    } catch (error) {
      expect((error as ConfigError).message).toContain('database.url');
      expect((error as ConfigError).message).not.toContain('hunter2');
    }
  });

  test('the frozen result cannot be mutated', () => {
    const config = appConfig().parse({});
    expect(Object.isFrozen(config.http.throttle)).toBe(true);
  });
});
