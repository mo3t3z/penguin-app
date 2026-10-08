// Only exact, known public errors are printable. Never log arbitrary response text.
const PUBLIC_MESSAGES = new Set([
  'Invalid JWT', 'Missing authorization header', 'Invalid API key',
  'Sign in to access post media.', 'Invalid or expired session.',
  'Use application/json.', 'Invalid JSON object.', 'Invalid identifier.',
  'Use JPEG, PNG or WebP.', 'Invalid size or position.',
  'Unable to verify post access.', 'Post not found.',
  'Media service is not configured.', 'Invalid B2 endpoint configuration.',
  'Unexpected media bucket configuration.', 'Invalid stored media key.',
  'Image slot is already reserved; inspect uploads or choose another slot.',
  'Unable to reserve upload.', 'Unable to inspect uploads.',
  'Media operation failed; retry later.',
]);
const PUBLIC_CODES = new Set(['23505', '23503', '23514', '23502', '42501', 'PGRST301', 'INVALID_JWT', 'NOT_FOUND', 'BOOT_ERROR', 'WORKER_ERROR']);

export function sanitizeMediaFailure(status: unknown, body: unknown) {
  const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const message = typeof record.error === 'string' ? record.error : record.message;
  const code = record.code;
  return {
    httpStatus: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    serverCode: typeof code === 'string' && PUBLIC_CODES.has(code) ? code : null,
    serverMessage: typeof message === 'string' && PUBLIC_MESSAGES.has(message)
      ? message : 'Unrecognized server error (details withheld).',
  };
}

export type MediaFailure = ReturnType<typeof sanitizeMediaFailure>;

export class MediaRequestError extends Error {
  readonly diagnostic: MediaFailure;
  constructor(diagnostic: MediaFailure) {
    super('Post media request failed.');
    this.name = 'MediaRequestError';
    this.diagnostic = diagnostic;
  }
}

export function mediaFailureFromCause(cause: unknown): MediaFailure | null {
  let current = cause;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof MediaRequestError) return current.diagnostic;
    current = current instanceof Error && 'cause' in current ? current.cause : null;
  }
  return null;
}

const PUBLIC_CLIENT_ERROR_NAMES = new Set([
  'FunctionsFetchError',
  'FunctionsHttpError',
  'FunctionsRelayError',
  'ProcessLockAcquireTimeoutError',
  'NavigatorLockAcquireTimeoutError',
  'AuthLockAcquireTimeoutError',
  'AbortError',
]);

export function sanitizeInvocationError(cause: unknown) {
  let current = cause;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const name = current instanceof Error ? current.name : null;
    if (name && PUBLIC_CLIENT_ERROR_NAMES.has(name)) {
      return { clientErrorCode: name };
    }
    if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      current = record.context ?? record.cause ?? null;
    } else {
      current = null;
    }
  }
  return { clientErrorCode: 'UnrecognizedClientError' };
}

export function authorizationValidation(input: { postId: string; mimeType: string; sizeBytes: number; position: number }) {
  return {
    postIdValid: typeof input.postId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.postId),
    mimeValid: ['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType),
    sizeValid: Number.isInteger(input.sizeBytes) && input.sizeBytes > 0 && input.sizeBytes <= 8 * 1024 * 1024,
    positionValid: Number.isInteger(input.position) && input.position >= 0 && input.position <= 3,
  };
}
