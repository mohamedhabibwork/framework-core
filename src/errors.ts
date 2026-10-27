/** Base class for framework failures that carry a stable machine-readable code. */
export class FrameworkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ResolutionError extends FrameworkError {
  constructor(
    code: string,
    message: string,
    readonly path: readonly string[],
  ) {
    super(code, `${message} (resolution path: ${path.join(' -> ')})`);
  }
}

export class ConfigError extends FrameworkError {
  constructor(readonly issues: readonly string[]) {
    super('CONFIG_INVALID', `Invalid configuration:\n  - ${issues.join('\n  - ')}`);
  }
}

export class BootError extends FrameworkError {
  constructor(provider: string, cause: ErrorOptions['cause']) {
    super('PROVIDER_BOOT_FAILED', `Provider "${provider}" failed to boot`, { cause });
  }
}
