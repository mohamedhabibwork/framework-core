import { FrameworkError } from '../errors';

interface Named {
  readonly name: string;
  readonly dependsOn?: readonly string[];
}

/** Topologically sorts providers by `dependsOn`, preserving declaration order among peers. */
export function orderProviders<T extends Named>(providers: readonly T[]): T[] {
  const byName = new Map<string, T>();
  for (const provider of providers) {
    if (byName.has(provider.name)) {
      throw new FrameworkError('DUPLICATE_PROVIDER', `Provider "${provider.name}" is registered twice`);
    }
    byName.set(provider.name, provider);
  }

  const ordered: T[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (provider: T, path: readonly string[]): void => {
    const current = state.get(provider.name);
    if (current === 'done') return;
    if (current === 'visiting') {
      throw new FrameworkError('PROVIDER_CYCLE', `Provider dependency cycle: ${[...path, provider.name].join(' -> ')}`);
    }
    state.set(provider.name, 'visiting');
    for (const dependency of provider.dependsOn ?? []) {
      const target = byName.get(dependency);
      if (!target) {
        throw new FrameworkError(
          'PROVIDER_MISSING_DEPENDENCY',
          `Provider "${provider.name}" depends on unregistered provider "${dependency}"`,
        );
      }
      visit(target, [...path, provider.name]);
    }
    state.set(provider.name, 'done');
    ordered.push(provider);
  };

  for (const provider of providers) visit(provider, []);
  return ordered;
}
