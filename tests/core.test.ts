import { describe, expect, test } from 'bun:test';
import { z } from 'zod/v4';
import {
  Application,
  BootError,
  ConfigError,
  Container,
  defineProvider,
  mergeEnv,
  parseConfig,
  parseEnvFile,
  REDACTED,
  ResolutionError,
  redact,
  token,
} from '../src';

describe('Container', () => {
  test('singletons are shared and scoped instances are isolated per scope', () => {
    const container = new Container();
    const Clock = token<{ id: number }>('clock');
    const RequestState = token<{ id: number }>('request-state');
    let counter = 0;
    container.singleton(Clock, () => ({ id: ++counter }));
    container.scoped(RequestState, () => ({ id: ++counter }));

    const a = container.createScope('request');
    const b = container.createScope('request');

    expect(a.resolve(Clock)).toBe(b.resolve(Clock));
    expect(a.resolve(RequestState)).toBe(a.resolve(RequestState));
    expect(a.resolve(RequestState)).not.toBe(b.resolve(RequestState));
  });

  test('concurrent scopes keep their own state', async () => {
    const container = new Container();
    const RequestId = token<string>('request-id');
    const Greeter = token<{ greet(): string }>('greeter');
    container.scoped(Greeter, (r) => ({ greet: () => `hello ${r.resolve(RequestId)}` }));

    const run = async (id: string) => {
      const scope = container.createScope('request').override(RequestId, id);
      await Bun.sleep(Math.random() * 5);
      const result = scope.resolve(Greeter).greet();
      await scope.dispose();
      return result;
    };

    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => run(`r${i}`)));
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => `hello r${i}`));
  });

  test('singletons cannot capture scoped services', () => {
    const container = new Container();
    const Scoped = token<object>('scoped-thing');
    const Single = token<object>('single-thing');
    container.scoped(Scoped, () => ({}));
    container.singleton(Single, (r) => ({ dep: r.resolve(Scoped) }));

    const scope = container.createScope('request');
    expect(() => scope.resolve(Single)).toThrow(/cannot be resolved outside a scope or from a singleton/);
  });

  test('cycles report a readable resolution path', () => {
    const container = new Container();
    const A = token<string>('A');
    const B = token<string>('B');
    container.singleton(A, (r) => r.resolve(B));
    container.singleton(B, (r) => r.resolve(A));

    try {
      container.resolve(A);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ResolutionError);
      expect((error as ResolutionError).path).toEqual(['A', 'B', 'A']);
    }
  });

  test('duplicate bindings and unbound tokens fail clearly', () => {
    const container = new Container();
    const T = token<number>('number');
    container.value(T, 1);
    expect(() => container.value(T, 2)).toThrow(/already bound/);
    expect(() => container.resolve(token('missing'))).toThrow(/No binding for "missing"/);
  });

  test('scope disposal runs disposers in reverse creation order', async () => {
    const container = new Container();
    const order: string[] = [];
    const First = token<string>('first');
    const Second = token<string>('second');
    container.scoped(
      First,
      () => 'first',
      () => void order.push('first'),
    );
    container.scoped(
      Second,
      (r) => `${r.resolve(First)}+second`,
      () => void order.push('second'),
    );

    const scope = container.createScope('job');
    scope.resolve(Second);
    await scope.dispose();
    expect(order).toEqual(['second', 'first']);
    expect(() => scope.resolve(First)).toThrow(/disposed/);
  });
});

describe('Application lifecycle', () => {
  test('boots providers in dependency order and shuts down in reverse', async () => {
    const events: string[] = [];
    const provider = (name: string, dependsOn: string[] = []) =>
      defineProvider({
        name,
        dependsOn,
        register: () => void events.push(`register:${name}`),
        boot: () => void events.push(`boot:${name}`),
        shutdown: () => void events.push(`shutdown:${name}`),
      });

    const app = new Application({ config: {}, providers: [provider('http', ['db']), provider('db')] });
    await app.boot();
    await app.shutdown();

    expect(events).toEqual(['register:db', 'register:http', 'boot:db', 'boot:http', 'shutdown:http', 'shutdown:db']);
    expect(app.state).toBe('stopped');
  });

  test('cleans up already-booted providers when a later provider fails', async () => {
    const events: string[] = [];
    const app = new Application({
      config: {},
      providers: [
        defineProvider({
          name: 'db',
          register: () => {},
          boot: () => void events.push('boot:db'),
          shutdown: () => void events.push('shutdown:db'),
        }),
        defineProvider({
          name: 'broken',
          dependsOn: ['db'],
          register: () => {},
          boot: () => {
            throw new Error('boom');
          },
        }),
      ],
    });

    await expect(app.boot()).rejects.toBeInstanceOf(BootError);
    expect(events).toEqual(['boot:db', 'shutdown:db']);
    expect(app.state).toBe('failed');
  });

  test('detects provider cycles and missing dependencies', () => {
    const p = (name: string, dependsOn: string[]) => defineProvider({ name, dependsOn, register: () => {} });
    expect(() => new Application({ config: {}, providers: [p('a', ['b']), p('b', ['a'])] })).toThrow(/a -> b -> a/);
    expect(() => new Application({ config: {}, providers: [p('a', ['ghost'])] })).toThrow(
      /unregistered provider "ghost"/,
    );
  });

  test('deferred providers only shut down when activated', async () => {
    const events: string[] = [];
    const Mailer = token<string>('mailer');
    const Unused = token<string>('unused');
    const deferred = (name: string, t: typeof Mailer) =>
      defineProvider({
        name,
        deferred: { provides: [t] },
        register: ({ container }) => void container.singleton(t, () => name),
        boot: () => void events.push(`boot:${name}`),
        shutdown: () => void events.push(`shutdown:${name}`),
      });

    const app = new Application({ config: {}, providers: [deferred('mail', Mailer), deferred('other', Unused)] });
    await app.boot();
    expect(app.container.resolve(Mailer)).toBe('mail');
    await app.shutdown();
    expect(events).toEqual(['shutdown:mail']);
  });

  test('withScope always disposes the scope', async () => {
    const app = await new Application({ config: {}, providers: [] }).boot();
    let disposed = false;
    const T = token<number>('t');
    app.container.scoped(
      T,
      () => 1,
      () => {
        disposed = true;
      },
    );
    await expect(
      app.withScope('command', (scope) => {
        scope.resolve(T);
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(disposed).toBe(true);
  });
});

describe('Configuration', () => {
  const schema = z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    databaseUrl: z.url(),
  });

  test('process environment overrides env file values', () => {
    const env = mergeEnv(parseEnvFile('PORT=4000\nDATABASE_URL="postgres://u:p@file/db" # c'), { PORT: '5000' });
    expect(env).toEqual({ PORT: '5000', DATABASE_URL: 'postgres://u:p@file/db' });
  });

  test('resolved configuration is validated and deeply frozen', () => {
    const config = parseConfig(schema, { databaseUrl: 'postgres://u:p@h/db' });
    expect(config.port).toBe(3000);
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('invalid configuration lists paths without echoing values', () => {
    try {
      parseConfig(schema, { port: 'nope', databaseUrl: 'super-secret-value' });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as ConfigError).message;
      expect(message).toContain('port');
      expect(message).toContain('databaseUrl');
      expect(message).not.toContain('super-secret-value');
    }
  });

  test('redaction masks secret keys and URL passwords', () => {
    expect(
      redact({ database: { url: 'postgres://app:hunter2@db:5432/app' }, auth: { jwtSecret: 'abc' }, name: 'app' }),
    ).toEqual({
      database: { url: `postgres://app:${REDACTED}@db:5432/app` },
      auth: { jwtSecret: REDACTED },
      name: 'app',
    });
  });
});
