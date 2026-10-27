import { FrameworkError } from '../errors';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

/** Minimal dotenv parser: KEY=value, quoted values, `#` comments. No interpolation. */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of contents.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const match = LINE.exec(raw);
    if (!match?.[1]) continue;
    let value = (match[2] ?? '').trim();
    const quote = value[0];
    const closing = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
    if (closing > 0) {
      value = value.slice(1, closing);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    result[match[1]] = value;
  }
  return result;
}

export async function readEnvFile(path: string, { required = false } = {}): Promise<Record<string, string>> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    if (required) throw new FrameworkError('ENV_FILE_MISSING', `Environment file not found: ${path}`);
    return {};
  }
  return parseEnvFile(await file.text());
}

/**
 * Precedence (highest first): process environment, environment file, schema defaults.
 * Returns a new object; neither input is mutated.
 */
export function mergeEnv(
  fileVars: Record<string, string>,
  processVars: Record<string, string | undefined>,
): Record<string, string> {
  const merged: Record<string, string> = { ...fileVars };
  for (const [key, value] of Object.entries(processVars)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
