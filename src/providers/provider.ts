import type { ServiceProvider } from '../types';

export type { ProviderContext, ServiceProvider } from '../types';

/** Identity helper keeping full provider type inference at call sites. */
export const defineProvider = <TConfig extends object = object>(
  provider: ServiceProvider<TConfig>,
): ServiceProvider<TConfig> => provider;
