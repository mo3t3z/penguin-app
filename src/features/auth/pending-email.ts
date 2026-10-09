// The address used for the latest sign-up, kept in memory only so the verification
// screen can show it and resend to it. It is never written to a URL or to storage,
// and is gone after a reload.
let pendingEmail: string | null = null;

export const pendingVerificationEmail = {
  set(email: string) { pendingEmail = email.trim() || null; },
  get() { return pendingEmail; },
  clear() { pendingEmail = null; },
};
