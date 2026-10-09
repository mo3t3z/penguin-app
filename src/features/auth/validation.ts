// Client-side form rules for the auth screens. Server password policy still applies.
export const MIN_PASSWORD_LENGTH = 8;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return emailPattern.test(email.trim());
}

export function emailError(email: string) {
  return isValidEmail(email) ? undefined : 'Enter a valid email address.';
}

// Logging in only requires a password; creating one enforces the minimum length.
export function passwordError(password: string, creating: boolean) {
  if (!password) return 'Enter your password.';
  if (creating && password.length < MIN_PASSWORD_LENGTH) return 'Use at least 8 characters.';
  return undefined;
}

export function confirmationError(password: string, confirmation: string) {
  return password === confirmation ? undefined : 'Passwords do not match.';
}
