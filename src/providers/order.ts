import { FrameworkError } from '../errors';
import type { ServiceValue, Token } from '../types';

type Tokens = readonly Token<ServiceValue>[];

interface Named {
  readonly name: string;
  readonly dependsOn?: readonly string[];
  readonly provides?: Tokens;
  readonly requires?: Tokens;
  readonly optional?: Tokens;
  readonly deferred?: { readonly provides: Tokens };
}

const providedTokens = (provider: Named): Tokens => [
  ...(provider.provides ?? []),
  ...(provider.deferred?.provides ?? []),
];

function providersByToken<T extends Named>(providers: readonly T[]): Map<symbol, T[]> {
  const byToken = new Map<symbol, T[]>();
  for (const provider of providers) {
    for (const provided of providedTokens(provider)) {
      byToken.set(provided.key, [...(byToken.get(provided.key) ?? []), provider]);
    }
  }
  return byToken;
}

/**
 * Topologically sorts providers by `dependsOn` names and by the tokens they
 * `requires`/`optional` from other providers' `provides`, preserving
 * declaration order among peers.
 */
export function orderProviders<T extends Named>(providers: readonly T[]): T[] {
  const byName = new Map<string, T>();
  for (const provider of providers) {
    if (byName.has(provider.name)) {
      throw new FrameworkError('DUPLICATE_PROVIDER', `Provider "${provider.name}" is registered twice`);
    }
    byName.set(provider.name, provider);
  }
  const byToken = providersByToken(providers);

  const dependenciesOf = (provider: T): T[] => {
    const named = (provider.dependsOn ?? []).map((dependency) => {
      const target = byName.get(dependency);
      if (!target) {
        throw new FrameworkError(
          'PROVIDER_MISSING_DEPENDENCY',
          `Provider "${provider.name}" depends on unregistered provider "${dependency}"`,
        );
      }
      return target;
    });
    const viaTokens = [...(provider.requires ?? []), ...(provider.optional ?? [])]
      .flatMap((needed) => byToken.get(needed.key) ?? [])
      .filter((target) => target !== provider);
    return [...named, ...viaTokens];
  };

  const ordered: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (provider: T, path: readonly string[]): void => {
    const current = state.get(provider.name);
    if (current === 'done') return;
    if (current === 'visiting') {
      throw new FrameworkError('PROVIDER_CYCLE', `Provider dependency cycle: ${[...path, provider.name].join(' -> ')}`);
    }
    state.set(provider.name, 'visiting');
    for (const dependency of dependenciesOf(provider)) visit(dependency, [...path, provider.name]);
    state.set(provider.name, 'done');
    ordered.push(provider);
  };

  for (const provider of providers) visit(provider, []);
  return ordered;
}

/** Fails when a `requires` token is neither provided by a provider nor already bound by the app. */
export function assertRequirementsMet(
  providers: readonly Named[],
  isBound: (token: Token<ServiceValue>) => boolean,
): void {
  const byToken = providersByToken(providers);
  for (const provider of providers) {
    const unmet = (provider.requires ?? []).find((needed) => !byToken.has(needed.key) && !isBound(needed));
    if (unmet) {
      throw new FrameworkError(
        'PROVIDER_MISSING_REQUIREMENT',
        `Provider "${provider.name}" requires "${unmet.name}", which no provider provides and the application has not bound`,
      );
    }
  }
}
