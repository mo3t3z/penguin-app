// Turns an authentication error into text for the student. Pure, so it can be unit
// tested; it never includes the server's own message, a token or a code.

function field(error: unknown, name: 'code' | 'status' | 'message'): unknown {
  return error && typeof error === 'object' && name in error ? (error as Record<string, unknown>)[name] : null;
}

// The server accepted the request but its mail provider refused to send (for
// example bad SMTP credentials). Nothing the student typed is wrong.
export function isEmailDeliveryFailure(error: unknown): boolean {
  const code = field(error, 'code');
  const status = field(error, 'status');
  const message = field(error, 'message');
  if (code === 'email_provider_disabled') return true;
  const serverFault = code === 'unexpected_failure' || (typeof status === 'number' && status >= 500);
  return serverFault && typeof message === 'string' && /send/i.test(message) && /mail/i.test(message);
}

export function isEmailRateLimited(error: unknown): boolean {
  const code = field(error, 'code');
  return code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || field(error, 'status') === 429;
}

export function authErrorMessage(error: unknown): string {
  const code = field(error, 'code');
  if (code === 'secure_pkce_unavailable') return 'This device can’t complete secure sign-in right now. Update Penguin and try again.';
  if (code === 'invalid_credentials') return 'The email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in. Use “Resend verification” if you need a new link.';
  if (code === 'same_password') return 'Choose a password different from your current password.';
  if (code === 'weak_password') return 'Choose a stronger password that meets the server’s password policy.';
  if (isEmailRateLimited(error)) return 'Too many attempts. Please try again later.';
  if (code === 'signup_disabled') return 'Account registration is currently unavailable.';
  if (code === 'email_address_invalid') return 'That email address can’t be used. Check it and try again.';
  if (isEmailDeliveryFailure(error)) return 'Penguin couldn’t send the email right now. This is a problem on our side, not with your details. Please try again later.';
  return 'We could not complete this request. Check your connection and try again.';
}
