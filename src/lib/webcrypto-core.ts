// The two Web Crypto functions Supabase Auth needs for PKCE, for runtimes that lack
// them (React Native has no `crypto.subtle`). Pure: the real random source and
// SHA-256 are passed in, so this file has no native import and can be unit tested.
//
// Without these the auth library sends the PKCE challenge with the "plain" method
// (challenge equal to verifier) and may build the verifier with Math.random. With
// them it uses a securely random verifier and the S256 method.
//
// Nothing here ever falls back to Math.random or to an unhashed challenge: if a
// secure implementation cannot be installed or does not behave correctly, the
// functions below throw and the caller refuses to start an email flow.

export type SecureCryptoProvider = {
  // Fills the array with cryptographically secure random values and returns it.
  getRandomValues: <T extends ArrayBufferView>(array: T) => T;
  // SHA-256 of the given bytes.
  sha256: (data: Uint8Array) => Promise<ArrayBuffer>;
};

type SubtleLike = { digest?: (algorithm: unknown, data: unknown) => Promise<ArrayBuffer> };
type CryptoLike = { getRandomValues?: unknown; subtle?: SubtleLike };
type GlobalLike = { crypto?: CryptoLike };

export class SecurePkceUnavailableError extends Error {
  readonly code = 'secure_pkce_unavailable';
  constructor(reason: string) {
    super(`Secure PKCE is unavailable: ${reason}`);
    this.name = 'SecurePkceUnavailableError';
  }
}

function algorithmName(algorithm: unknown) {
  const name = typeof algorithm === 'string' ? algorithm
    : algorithm && typeof algorithm === 'object' && 'name' in algorithm ? (algorithm as { name?: unknown }).name : null;
  return typeof name === 'string' ? name.toUpperCase() : null;
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new TypeError('digest expects binary data');
}

export type WebCryptoInstallation = { randomValues: 'existing' | 'installed'; digest: 'existing' | 'installed' };

// Adds only what is missing and never replaces an implementation the runtime
// already has.
export function installWebCrypto(target: GlobalLike, provider: SecureCryptoProvider): WebCryptoInstallation {
  if (typeof provider?.getRandomValues !== 'function' || typeof provider?.sha256 !== 'function') {
    throw new SecurePkceUnavailableError('no secure crypto provider');
  }
  if (!target.crypto || typeof target.crypto !== 'object') {
    try { Object.defineProperty(target, 'crypto', { value: {}, configurable: true, writable: true, enumerable: false }); }
    catch { throw new SecurePkceUnavailableError('crypto cannot be defined'); }
  }
  const crypto = target.crypto as CryptoLike;
  const result: WebCryptoInstallation = { randomValues: 'existing', digest: 'existing' };
  try {
    if (typeof crypto.getRandomValues !== 'function') {
      crypto.getRandomValues = <T extends ArrayBufferView>(array: T) => provider.getRandomValues(array);
      result.randomValues = 'installed';
    }
    if (typeof crypto.subtle?.digest !== 'function') {
      const digest = async (algorithm: unknown, data: unknown) => {
        // Only what PKCE needs. Anything else is refused rather than approximated.
        if (algorithmName(algorithm) !== 'SHA-256') throw new Error('Only SHA-256 is supported');
        return provider.sha256(toBytes(data));
      };
      if (crypto.subtle && typeof crypto.subtle === 'object') crypto.subtle.digest = digest;
      else crypto.subtle = { digest };
      result.digest = 'installed';
    }
  } catch (cause) {
    if (cause instanceof SecurePkceUnavailableError) throw cause;
    throw new SecurePkceUnavailableError('crypto cannot be extended');
  }
  return result;
}

// RFC 7636, appendix B: the published verifier and its S256 challenge.
export const RFC7636_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
export const RFC7636_S256_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function base64Url(bytes: Uint8Array) {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    text += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)];
    if (index + 1 < bytes.length) text += BASE64[((b & 15) << 2) | (c >> 6)];
    if (index + 2 < bytes.length) text += BASE64[c & 63];
  }
  return text;
}

type TextEncoderLike = new () => { encode: (text: string) => Uint8Array };

// Proves, on the device that is running, that everything the auth library checks
// for is present and that the installed SHA-256 produces the published S256
// challenge, and that the random source is not returning constant data. It uses
// only public test values; no real verifier or challenge is involved.
export async function verifySecurePkce(target: GlobalLike & { TextEncoder?: unknown; btoa?: unknown }): Promise<void> {
  const crypto = target.crypto;
  if (!crypto || typeof crypto.getRandomValues !== 'function') throw new SecurePkceUnavailableError('no secure random source');
  if (typeof crypto.subtle?.digest !== 'function') throw new SecurePkceUnavailableError('no SHA-256');
  if (typeof target.TextEncoder !== 'function') throw new SecurePkceUnavailableError('no TextEncoder');
  if (typeof target.btoa !== 'function') throw new SecurePkceUnavailableError('no base64 encoder');

  const first = new Uint32Array(8);
  const second = new Uint32Array(8);
  (crypto.getRandomValues as (array: Uint32Array) => Uint32Array)(first);
  (crypto.getRandomValues as (array: Uint32Array) => Uint32Array)(second);
  const allZero = (values: Uint32Array) => values.every((value) => value === 0);
  if (allZero(first) || allZero(second) || first.every((value, index) => value === second[index])) {
    throw new SecurePkceUnavailableError('random source is not random');
  }

  let challenge: string;
  try {
    const encoded = new (target.TextEncoder as TextEncoderLike)().encode(RFC7636_VERIFIER);
    challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)));
  } catch {
    throw new SecurePkceUnavailableError('SHA-256 failed');
  }
  if (challenge !== RFC7636_S256_CHALLENGE) throw new SecurePkceUnavailableError('SHA-256 gave a wrong result');
}
