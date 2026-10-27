/**
 * The complete, stable error-code catalog. Every error response carries one
 * of these codes; clients switch on `code`, never on message text.
 *
 * Lives in core (not http) so `@framework/openapi` can derive per-status
 * code enums without depending on the HTTP kernel.
 */
export const ERROR_CATALOG = {
  BAD_REQUEST: { status: 400, message: 'The request is malformed' },
  MALFORMED_JSON: { status: 400, message: 'Malformed JSON in request body' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication is required' },
  FORBIDDEN: { status: 403, message: 'This action is not allowed' },
  NOT_FOUND: { status: 404, message: 'The requested resource was not found' },
  ROUTE_NOT_FOUND: { status: 404, message: 'Route not found' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
  CONFLICT: { status: 409, message: 'The request conflicts with the current state' },
  UNIQUE_VIOLATION: { status: 409, message: 'A resource with the same unique value already exists' },
  FOREIGN_KEY_VIOLATION: { status: 409, message: 'The request references a missing or still-referenced resource' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Unsupported content type' },
  VALIDATION_FAILED: { status: 422, message: 'The given data was invalid' },
  TOO_MANY_REQUESTS: { status: 429, message: 'Too many requests' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
  CAPABILITY_UNSUPPORTED: { status: 501, message: 'The requested capability is not supported by this backend' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'A required service is unavailable' },
  SEARCH_ENGINE_UNAVAILABLE: { status: 503, message: 'The search engine is unavailable' },
} as const;

export type ErrorCode = keyof typeof ERROR_CATALOG;
export type ErrorStatus = (typeof ERROR_CATALOG)[ErrorCode]['status'];

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as ErrorCode[];

/** Codes that can be returned with a given status (used for OpenAPI enums). */
export function codesForStatus(status: ErrorStatus): ErrorCode[] {
  return ERROR_CODES.filter((code) => ERROR_CATALOG[code].status === status);
}

export const ERROR_STATUSES = [...new Set(ERROR_CODES.map((code) => ERROR_CATALOG[code].status))].sort(
  (a, b) => a - b,
) as ErrorStatus[];
