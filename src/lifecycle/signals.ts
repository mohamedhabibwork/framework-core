import type { GracefulShutdownOptions } from '../types';

export type { GracefulShutdownOptions } from '../types';

/** Installs SIGTERM/SIGINT handlers that drain within a bounded deadline. Returns an uninstall function. */
export function installGracefulShutdown(options: GracefulShutdownOptions): () => void {
  const signals = options.signals ?? ['SIGTERM', 'SIGINT'];
  const log = options.log ?? ((message: string) => console.error(message));
  let shuttingDown = false;

  const handler = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}; draining (deadline ${options.timeoutMs}ms)`);
    const deadline = setTimeout(() => {
      log('Shutdown deadline exceeded; exiting');
      process.exit(1);
    }, options.timeoutMs);
    deadline.unref?.();
    options
      .onShutdown(signal)
      .then(() => process.exit(signal === 'SIGINT' ? 130 : 0))
      .catch((error: Error) => {
        log(`Shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      });
  };

  for (const signal of signals) process.on(signal, handler);
  return () => {
    for (const signal of signals) process.off(signal, handler);
  };
}
