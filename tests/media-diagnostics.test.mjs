import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizationValidation, sanitizeMediaFailure } from '../src/features/posts/media-diagnostics.ts';

test('recognizes function, gateway, and reservation errors without losing status', () => {
  assert.deepEqual(sanitizeMediaFailure(503, { error: 'Unable to reserve upload.' }), {
    httpStatus: 503, serverCode: null, serverMessage: 'Unable to reserve upload.',
  });
  assert.deepEqual(sanitizeMediaFailure(401, { code: 'INVALID_JWT', message: 'Invalid JWT' }), {
    httpStatus: 401, serverCode: 'INVALID_JWT', serverMessage: 'Invalid JWT',
  });
});

test('arbitrary messages, credentials, response fields and codes cannot enter diagnostics', () => {
  const secret = 'private-token-123';
  for (const body of [
    { error: `https://example.com/?signature=${secret}`, code: secret },
    { message: `Bearer ${secret}`, headers: { authorization: secret } },
    { error: { message: secret }, url: secret },
    secret, null,
  ]) {
    assert.ok(!JSON.stringify(sanitizeMediaFailure(500, body)).includes(secret));
  }
  assert.equal(sanitizeMediaFailure(undefined, undefined).httpStatus, null);
});

test('request validation diagnoses individual fields without including identifiers or values', () => {
  const input = { postId: '00000000-0000-4000-8000-000000000001', mimeType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024, position: 0 };
  assert.deepEqual(authorizationValidation(input), { postIdValid: true, mimeValid: true, sizeValid: true, positionValid: true });
  assert.deepEqual(authorizationValidation({ postId: 'bad', mimeType: 'secret', sizeBytes: 9 * 1024 * 1024, position: 4 }), {
    postIdValid: false, mimeValid: false, sizeValid: false, positionValid: false,
  });
});
