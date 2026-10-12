// PKCE security: the installed Supabase Auth library must pick the S256 challenge
// method with a securely random verifier once Penguin's Web Crypto support is
// installed.
//
// What these tests prove: the REAL auth library code from node_modules (not a copy
// or a mock of it) chooses "plain" without the support and "s256" with it, and the
// challenge it sends is the SHA-256 of the verifier it stored.
// What they cannot prove: that expo-crypto's native Android implementation is
// correct. In these tests the random source and SHA-256 come from Node. On the
// device the same check (verifySecurePkce) runs against the real native functions
// before any email flow starts, and the flow is refused if it fails.
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  base64Url,
  installWebCrypto,
  RFC7636_S256_CHALLENGE,
  RFC7636_VERIFIER,
  SecurePkceUnavailableError,
  verifySecurePkce,
} from '../src/lib/webcrypto-core.ts';

const require = createRequire(import.meta.url);
const authHelpers = require('../node_modules/@supabase/auth-js/dist/main/lib/helpers.js');
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = (source) => source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

// Stands in for expo-crypto with the same two capabilities, using Node's real
// implementations.
const nodeProvider = {
  getRandomValues: (array) => webcrypto.getRandomValues(array),
  sha256: async (data) => {
    const hash = createHash('sha256').update(data).digest();
    return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
  },
};
const s256 = (verifier) => createHash('sha256').update(verifier).digest('base64url');

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => { items.set(key, value); },
    removeItem: async (key) => { items.delete(key); },
  };
}
const storedVerifier = (storage) => JSON.parse(storage.items.get('sb-test-auth-token-code-verifier'));

// Runs `body` with the process-wide `crypto` replaced, as the auth library reads the
// global. Always restores the original.
async function withGlobalCrypto(value, body) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  const warn = console.warn;
  const warnings = [];
  console.warn = (...parts) => { warnings.push(parts.join(' ')); };
  try { return await body(warnings); }
  finally {
    console.warn = warn;
    if (original) Object.defineProperty(globalThis, 'crypto', original);
    else delete globalThis.crypto;
  }
}

// --- The real auth library ----------------------------------------------------------

test('without Web Crypto the auth library falls back to the plain method (the defect)', async () => {
  await withGlobalCrypto(undefined, async (warnings) => {
    const storage = memoryStorage();
    const [challenge, method] = await authHelpers.getCodeChallengeAndMethod(storage, 'sb-test-auth-token');
    assert.equal(method, 'plain');
    assert.equal(challenge, storedVerifier(storage), 'the challenge sent is the verifier itself');
    assert.ok(warnings.some((line) => line.includes('WebCrypto API is not supported')));
  });
});

test('with Penguin’s Web Crypto support the auth library selects S256', async () => {
  await withGlobalCrypto(undefined, async (warnings) => {
    assert.deepEqual(installWebCrypto(globalThis, nodeProvider), { randomValues: 'installed', digest: 'installed' });
    const storage = memoryStorage();
    const [challenge, method, flowId] = await authHelpers.getCodeChallengeAndMethod(storage, 'sb-test-auth-token');
    const verifier = storedVerifier(storage);
    assert.equal(method, 's256');
    assert.notEqual(challenge, verifier);
    assert.equal(challenge, s256(verifier), 'the challenge is the SHA-256 of the stored verifier');
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    // 56 random 32-bit values rendered as hex by the library.
    assert.match(verifier, /^[0-9a-f]{112}$/);
    assert.match(flowId, /^[0-9a-f]{32}$/);
    assert.deepEqual(warnings, [], 'no plain-method warning');
  });
});

test('every flow gets a new verifier, and recovery keeps its marker with S256', async () => {
  await withGlobalCrypto(undefined, async () => {
    installWebCrypto(globalThis, nodeProvider);
    const verifiers = new Set();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const storage = memoryStorage();
      const [, method] = await authHelpers.getCodeChallengeAndMethod(storage, 'sb-test-auth-token');
      assert.equal(method, 's256');
      verifiers.add(storedVerifier(storage));
    }
    assert.equal(verifiers.size, 20);
    const storage = memoryStorage();
    const [challenge, method] = await authHelpers.getCodeChallengeAndMethod(storage, 'sb-test-auth-token', true);
    const [verifier, marker] = storedVerifier(storage).split('/');
    assert.equal(method, 's256');
    assert.equal(marker, 'recovery');
    assert.equal(challenge, s256(verifier));
  });
});

test('the auth library’s own challenge function produces the RFC 7636 example', async () => {
  await withGlobalCrypto(undefined, async () => {
    installWebCrypto(globalThis, nodeProvider);
    assert.equal(await authHelpers.generatePKCEChallenge(RFC7636_VERIFIER), RFC7636_S256_CHALLENGE);
  });
});

// --- Installation -------------------------------------------------------------------

test('installation adds only what is missing and never replaces a runtime implementation', () => {
  const getRandomValues = (array) => array;
  const digest = async () => new ArrayBuffer(32);
  const complete = { crypto: { getRandomValues, subtle: { digest } } };
  assert.deepEqual(installWebCrypto(complete, nodeProvider), { randomValues: 'existing', digest: 'existing' });
  assert.equal(complete.crypto.getRandomValues, getRandomValues);
  assert.equal(complete.crypto.subtle.digest, digest);

  const randomOnly = { crypto: { getRandomValues } };
  assert.deepEqual(installWebCrypto(randomOnly, nodeProvider), { randomValues: 'existing', digest: 'installed' });
  assert.equal(randomOnly.crypto.getRandomValues, getRandomValues);

  const empty = {};
  assert.deepEqual(installWebCrypto(empty, nodeProvider), { randomValues: 'installed', digest: 'installed' });
  assert.equal(typeof empty.crypto.subtle.digest, 'function');
});

test('installation refuses to proceed without a secure provider', () => {
  for (const provider of [undefined, null, {}, { getRandomValues: () => {} }, { sha256: async () => {} }]) {
    assert.throws(() => installWebCrypto({}, provider), SecurePkceUnavailableError);
  }
  assert.throws(() => installWebCrypto(Object.freeze({}), nodeProvider), SecurePkceUnavailableError);
  assert.equal(new SecurePkceUnavailableError('x').code, 'secure_pkce_unavailable');
});

test('the installed digest is SHA-256 only and accepts the binary forms the library uses', async () => {
  const target = {};
  installWebCrypto(target, nodeProvider);
  const bytes = new TextEncoder().encode(RFC7636_VERIFIER);
  for (const [algorithm, data] of [['SHA-256', bytes], [{ name: 'sha-256' }, bytes.buffer], ['SHA-256', new DataView(bytes.buffer)]]) {
    assert.equal(base64Url(new Uint8Array(await target.crypto.subtle.digest(algorithm, data))), RFC7636_S256_CHALLENGE);
  }
  for (const algorithm of ['SHA-1', 'MD5', 'SHA-512', { name: 'plain' }, null, undefined]) {
    await assert.rejects(target.crypto.subtle.digest(algorithm, bytes));
  }
  await assert.rejects(target.crypto.subtle.digest('SHA-256', 'a string'));
});

test('base64url matches the platform encoder for every remainder length', () => {
  for (let length = 0; length <= 40; length += 1) {
    const bytes = webcrypto.getRandomValues(new Uint8Array(length));
    assert.equal(base64Url(bytes), Buffer.from(bytes).toString('base64url'));
  }
});

// --- The device check ---------------------------------------------------------------

const environment = (provider) => {
  const target = { TextEncoder, btoa };
  installWebCrypto(target, provider);
  return target;
};

test('the device check passes with a real random source and SHA-256', async () => {
  await verifySecurePkce(environment(nodeProvider));
});

test('the device check fails closed on a wrong hash, a weak random source or a missing piece', async () => {
  const unavailable = (target) => assert.rejects(verifySecurePkce(target), SecurePkceUnavailableError);
  // A "hash" that is not SHA-256.
  await unavailable(environment({ ...nodeProvider, sha256: async () => new ArrayBuffer(32) }));
  await unavailable(environment({ ...nodeProvider, sha256: async (data) => data.buffer }));
  await unavailable(environment({ ...nodeProvider, sha256: async () => { throw new Error('native failure'); } }));
  // Random sources that are not random.
  await unavailable(environment({ ...nodeProvider, getRandomValues: (array) => array }));
  await unavailable(environment({ ...nodeProvider, getRandomValues: (array) => array.fill(7) }));
  // Missing pieces the auth library also requires.
  await unavailable({});
  await unavailable({ crypto: {} });
  await unavailable({ ...environment(nodeProvider), TextEncoder: undefined });
  await unavailable({ ...environment(nodeProvider), btoa: undefined });
  const noDigest = environment(nodeProvider);
  noDigest.crypto.subtle = {};
  await unavailable(noDigest);
});

// --- Wiring and regression (source checks) ------------------------------------------

test('Web Crypto support is loaded before the Supabase client and the lock option is gone', () => {
  const client = read('../src/lib/supabase.ts');
  const crypto = client.indexOf("import './webcrypto';");
  assert.ok(crypto > 0 && crypto < client.indexOf("from '@supabase/supabase-js'"));
  assert.ok(crypto < client.indexOf('createClient<Database>('));
  assert.ok(!code(client).includes('lock'));
  assert.ok(!client.includes('processLock'));
  assert.ok(client.includes("import { createClient } from '@supabase/supabase-js';"));
  // The rest of the client configuration is unchanged.
  for (const setting of ["flowType: 'pkce'", 'detectSessionInUrl: false', 'persistSession: true', 'autoRefreshToken: true',
    '{ storage: nativeAuthStorage }']) {
    assert.ok(client.includes(setting), setting);
  }
});

test('the native binding uses the operating system and no weak fallback exists anywhere', () => {
  const binding = read('../src/lib/webcrypto.ts');
  assert.ok(binding.includes("import * as ExpoCrypto from 'expo-crypto';"));
  assert.ok(binding.includes('ExpoCrypto.getRandomValues('));
  assert.ok(binding.includes('ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256,'));
  assert.ok(binding.includes('installWebCrypto(globalThis as never, provider);'));
  assert.ok(binding.includes('verification ??= verifySecurePkce(globalThis as never);'));
  for (const source of [binding, read('../src/lib/webcrypto-core.ts')]) {
    assert.ok(!code(source).includes('Math.random'));
    assert.ok(!code(source).includes('console.'));
    assert.ok(!/['"]plain['"]/.test(code(source)));
  }
  // expo-crypto was already a dependency, so no native rebuild is involved.
  assert.ok(JSON.parse(read('../package.json')).dependencies['expo-crypto']);
});

test('every email flow confirms secure PKCE first, and recovery does not hide a failure', () => {
  const service = read('../src/features/auth/service.ts');
  assert.ok(service.includes("import { securePkceReady } from '@/lib/webcrypto';"));
  assert.equal(service.split('await securePkceReady();').length - 1, 3);
  const before = (name, call) => {
    const start = service.indexOf(`export async function ${name}(`);
    const guard = service.indexOf('await securePkceReady();', start);
    assert.ok(start > 0 && guard > start && guard < service.indexOf(call, start), name);
  };
  before('signUp', 'auth.signUp(');
  before('resendVerification', 'auth.resend(');
  before('requestPasswordRecovery', 'auth.resetPasswordForEmail(');
  const recovery = service.slice(service.indexOf('export async function requestPasswordRecovery('));
  assert.ok(recovery.indexOf('await securePkceReady();') < recovery.indexOf('try {'));
  // Signing in, the code exchange and the redirect address are untouched.
  assert.ok(service.includes('auth.signInWithPassword({ email: email.trim(), password })'));
  assert.ok(service.includes('await auth.exchangeCodeForSession(code)'));
  assert.equal(service.split('authCallbackUrl()').length - 1, 3);
  assert.ok(!service.includes('console.'));
});

test('an insecure device gets a clear message, never the server text', async () => {
  const { authErrorMessage } = await import('../src/features/auth/auth-errors.ts');
  assert.match(authErrorMessage(new SecurePkceUnavailableError('no SHA-256')), /can’t complete secure sign-in right now/);
  assert.doesNotMatch(authErrorMessage(new SecurePkceUnavailableError('no SHA-256')), /SHA|PKCE|crypto/i);
  assert.equal(authErrorMessage({ code: 'invalid_credentials' }), 'The email or password is incorrect.');
});
