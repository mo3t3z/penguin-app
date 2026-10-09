// Reads the parameters of an email link that opened the app (penguin://auth/callback
// or the Expo Go equivalent). Pure: it decides what the callback screen should do
// and never stores, logs or returns anything except the single credential to use.

type Param = string | string[] | undefined;
export type EmailCallbackParams = {
  code?: Param;
  token_hash?: Param;
  type?: Param;
  error?: Param;
  error_code?: Param;
  error_description?: Param;
};

export type EmailCallbackFailure = 'expired' | 'denied' | 'malformed' | 'missing';
export type EmailCallbackRequest =
  // A PKCE authorization code from a confirmation or recovery email.
  | { kind: 'code'; code: string }
  // A one-use recovery hash, when the reset template links to the app directly.
  | { kind: 'recovery-token'; tokenHash: string }
  | { kind: 'failed'; reason: EmailCallbackFailure };

// Codes and hashes are opaque, but they are always short URL-safe strings.
// Anything else did not come from Supabase and is not sent to it.
const CREDENTIAL = /^[A-Za-z0-9._~-]{8,512}$/;

function single(value: Param): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readEmailCallback(params: EmailCallbackParams): EmailCallbackRequest {
  const errorCode = single(params.error_code);
  if (params.error !== undefined || params.error_code !== undefined || params.error_description !== undefined) {
    // Supabase reports a used or expired link as otp_expired.
    return { kind: 'failed', reason: errorCode === 'otp_expired' ? 'expired' : 'denied' };
  }
  const code = single(params.code);
  const tokenHash = single(params.token_hash);
  if (params.code !== undefined && params.token_hash !== undefined) return { kind: 'failed', reason: 'malformed' };
  if (params.token_hash !== undefined) {
    if (!tokenHash || params.type !== 'recovery' || !CREDENTIAL.test(tokenHash)) return { kind: 'failed', reason: 'malformed' };
    return { kind: 'recovery-token', tokenHash };
  }
  if (params.code !== undefined) {
    if (!code || !CREDENTIAL.test(code)) return { kind: 'failed', reason: 'malformed' };
    return { kind: 'code', code };
  }
  return { kind: 'failed', reason: 'missing' };
}

// A stable key for the request, so the screen restarts only when the link changes.
export function emailCallbackKey(request: EmailCallbackRequest) {
  return request.kind === 'code' ? `code:${request.code}`
    : request.kind === 'recovery-token' ? `recovery:${request.tokenHash}` : `failed:${request.reason}`;
}

// 'exchange' is a link that looked valid but that Supabase refused: used twice,
// expired, superseded by a newer email, or opened on another device.
export type EmailCallbackProblem = EmailCallbackFailure | 'exchange';

export function emailCallbackProblemText(problem: EmailCallbackProblem): string {
  if (problem === 'expired') {
    return 'This link has expired or was already used. Links work once. Request a fresh one below.';
  }
  if (problem === 'exchange') {
    return 'Penguin couldn’t finish with this link. Only the most recent email works, on the device that requested it. If you were confirming your email, it may already be confirmed: try logging in. Otherwise request a fresh link.';
  }
  if (problem === 'missing' || problem === 'malformed') {
    return 'This link is incomplete. Open the link from the latest Penguin email again, or request a fresh one below.';
  }
  return 'This link can’t be used. Request a fresh one below.';
}
