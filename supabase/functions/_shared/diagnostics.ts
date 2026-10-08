import { HttpError } from './validation.ts';

const DATABASE_CODES = new Set(['23505', '23503', '23514', '23502', '42501', '42P01', '42703', 'PGRST204', 'PGRST301']);
const HTTP_CODES = new Map([
  ['Media service is not configured.', 'MISSING_CONFIGURATION'],
  ['Invalid B2 endpoint configuration.', 'INVALID_B2_ENDPOINT'],
  ['Unexpected media bucket configuration.', 'UNEXPECTED_BUCKET'],
  ['Invalid stored media key.', 'INVALID_STORAGE_KEY'],
  ['Unable to verify post access.', 'OWNERSHIP_QUERY_FAILED'],
  ['Post not found.', 'POST_NOT_FOUND'],
  ['Image slot is already reserved; inspect uploads or choose another slot.', 'RESERVATION_CONFLICT'],
  ['Unable to reserve upload.', 'RESERVATION_FAILED'],
]);

// Never serialize an Error, database response, request, or environment value.
export function safeServerFailure(error: unknown, databaseCode?: unknown) {
  const errorClass = error instanceof HttpError ? 'HttpError'
    : error instanceof TypeError ? 'TypeError'
    : error instanceof RangeError ? 'RangeError'
    : error instanceof SyntaxError ? 'SyntaxError'
    : error instanceof DOMException ? 'DOMException'
    : error instanceof Error ? 'Error' : 'UnknownError';
  return {
    errorClass,
    code: error instanceof HttpError ? HTTP_CODES.get(error.message) ?? 'HANDLED_HTTP_ERROR' : 'UNEXPECTED_EXCEPTION',
    httpStatus: error instanceof HttpError ? error.status : 500,
    databaseCode: typeof databaseCode === 'string' && DATABASE_CODES.has(databaseCode) ? databaseCode : null,
  };
}
