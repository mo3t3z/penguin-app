import * as ExpoCrypto from 'expo-crypto';
import {
  installWebCrypto,
  SecurePkceUnavailableError,
  verifySecurePkce,
  type SecureCryptoProvider,
} from './webcrypto-core';

// Backed by the operating system through expo-crypto: SecureRandom and
// MessageDigest on Android, the equivalent system APIs on iOS.
const provider: SecureCryptoProvider = {
  getRandomValues: (array) => ExpoCrypto.getRandomValues(array as unknown as Uint8Array) as unknown as typeof array,
  sha256: (data) => ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data as unknown as BufferSource),
};

// Runs when this module is first imported, which src/lib/supabase.ts does before it
// creates the client. A failure is kept and reported by securePkceReady() rather
// than thrown here, so the app still starts and only the email flows refuse to run.
let installError: SecurePkceUnavailableError | null = null;
try {
  installWebCrypto(globalThis as never, provider);
} catch (cause) {
  installError = cause instanceof SecurePkceUnavailableError ? cause : new SecurePkceUnavailableError('installation failed');
}

let verification: Promise<void> | null = null;

// Resolves only when this device has a secure random source and a SHA-256 that
// produces the published S256 test challenge; the auth library then uses S256.
// Rejects with SecurePkceUnavailableError otherwise. Checked once and remembered.
export function securePkceReady(): Promise<void> {
  if (installError) return Promise.reject(installError);
  verification ??= verifySecurePkce(globalThis as never);
  return verification;
}
