export const REDACTED = '[REDACTED]';

const SECRET_KEY = /(secret|password|passwd|token|api[-_]?key|private[-_]?key|credential|authorization|cookie|dsn)/i;
// user:password@ up to the last '@' of the URL token (passwords may contain '/' or '@'); anywhere in text.
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)([^:/@\s]+)(?::(\S*?))?@(?=[^@\s]*(?:\s|$))/gi;
const QUERY_SECRET = /([?&](?:password|passwd|token|secret|api[_-]?key|access[_-]?token)=)[^&\s#]+/gi;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** Masks the password portion of connection URLs such as postgres://user:pass@host/db. */
export function redactUrl(value: string): string {
  return value
    .replace(URL_CREDENTIALS, (_m, scheme: string, user: string, pass?: string) =>
      pass === undefined ? `${scheme}${user}@` : `${scheme}${user}:${REDACTED}@`,
    )
    .replace(QUERY_SECRET, `$1${REDACTED}`);
}

/** Returns a deep copy with secret-looking keys and URL credentials masked. */
export function redact<T>(value: T, key = ''): T {
  if (key && isSecretKey(key) && value !== undefined && value !== null && value !== '') {
    return REDACTED as T;
  }
  if (typeof value === 'string') return redactUrl(value) as T;
  if (Array.isArray(value)) return value.map((item) => redact(item)) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)])) as T;
  }
  return value;
}
