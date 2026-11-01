import { DEFAULT_HEALTH_TIMEOUT_MS } from './constants';
import type { HealthCheck, HealthCheckOptions, HealthStatus, Resolver } from './types';

/** Declares a readiness probe; `probe` resolves services from the caller's scope. */
export const defineHealthCheck = (
  name: string,
  probe: (resolver: Resolver) => Promise<void>,
  options: HealthCheckOptions = {},
): HealthCheck => ({ name, probe, ...options });

async function runOne(check: HealthCheck, resolver: Resolver, defaultTimeoutMs: number): Promise<HealthStatus> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<HealthStatus>((settle) => {
    timer = setTimeout(() => settle('failed'), check.timeoutMs ?? defaultTimeoutMs);
  });
  const probe = check.probe(resolver).then(
    (): HealthStatus => 'ok',
    (): HealthStatus => 'failed',
  );
  try {
    return await Promise.race([probe, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every probe concurrently; results keep the declaration order. */
export async function runHealthChecks(
  checks: readonly HealthCheck[],
  resolver: Resolver,
  defaultTimeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<readonly (readonly [string, HealthStatus])[]> {
  return Promise.all(
    checks.map(async (check) => [check.name, await runOne(check, resolver, defaultTimeoutMs)] as const),
  );
}
