import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isSignedMediaUrlFresh,
  orderReadyMedia,
  parseSignedMediaUrl,
  RequestGeneration,
  shouldRequestPrivateMedia,
  SignedMediaMemoryCache,
  signedMediaRefreshDelay,
} from '../src/features/posts/private-media.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');

test('signed read URLs are accepted only when HTTPS and unexpired', () => {
  const parsed = parseSignedMediaUrl({
    url: 'https://f000.backblazeb2.com/file/private/object?X-Amz-Signature=redacted',
    expiresAt: '2026-10-08T12:05:00.000Z',
  }, now);
  assert.equal(parsed.expiresAt, now + 300_000);
  assert.throws(() => parseSignedMediaUrl({ url: 'http://example.test/object', expiresAt: '2026-10-08T12:05:00.000Z' }, now));
  assert.throws(() => parseSignedMediaUrl({ url: 'https://example.test/object', expiresAt: '2026-10-08T11:59:59.000Z' }, now));
});

test('expiry refresh is scheduled at expiration rather than on feed refresh', () => {
  const value = { expiresAt: now + 300_000 };
  assert.equal(signedMediaRefreshDelay(value, now), 300_000);
  assert.equal(isSignedMediaUrlFresh(value, now), true);
  assert.equal(signedMediaRefreshDelay(value, now + 275_000), 25_000);
  assert.equal(isSignedMediaUrlFresh(value, now + 275_000), true);
  assert.equal(signedMediaRefreshDelay(value, now + 300_000), 0);
  assert.equal(isSignedMediaUrlFresh(value, now + 300_000), false);
});

test('memory cache reuses valid URLs for unchanged media and drops expired entries', () => {
  const cache = new SignedMediaMemoryCache();
  const value = { url: 'https://example.test/signed', expiresAt: now + 300_000 };
  cache.activateUser('user-a');
  cache.set('user-a', 'media-a', value);
  assert.strictEqual(cache.get('user-a', 'media-a', now), value);
  assert.equal(cache.get('user-a', 'media-a', now + 300_000), null);
});

test('memory cache clears URLs when the authenticated account changes', () => {
  const cache = new SignedMediaMemoryCache();
  const value = { url: 'https://example.test/signed', expiresAt: now + 300_000 };
  cache.activateUser('user-a');
  cache.set('user-a', 'media-a', value);
  cache.activateUser('user-b');
  assert.equal(cache.get('user-a', 'media-a', now), null);
  assert.equal(cache.get('user-b', 'media-a', now), null);
});

test('memory cache evicts the least recently used URL at its capacity', () => {
  const cache = new SignedMediaMemoryCache(2);
  cache.activateUser('user-a');
  const value = (suffix) => ({ url: `https://example.test/${suffix}`, expiresAt: now + 300_000 });
  cache.set('user-a', 'media-a', value('a'));
  cache.set('user-a', 'media-b', value('b'));
  cache.get('user-a', 'media-a', now);
  cache.set('user-a', 'media-c', value('c'));
  assert.equal(cache.get('user-a', 'media-b', now), null);
  assert.equal(cache.get('user-a', 'media-a', now)?.url, 'https://example.test/a');
  assert.equal(cache.get('user-a', 'media-c', now)?.url, 'https://example.test/c');
});

test('private media requests require both visibility and an authenticated account', () => {
  assert.equal(shouldRequestPrivateMedia(false, 'user-a'), false);
  assert.equal(shouldRequestPrivateMedia(true, null), false);
  assert.equal(shouldRequestPrivateMedia(true, 'user-a'), true);
});

test('ready media is filtered and ordered by position with a stable id tie-break', () => {
  const media = [
    { id: 'c', position: 2, status: 'ready' },
    { id: 'b', position: 0, status: 'pending' },
    { id: 'b', position: 0, status: 'ready' },
    { id: 'a', position: 0, status: 'ready' },
  ];
  assert.deepEqual(orderReadyMedia(media).map(({ id }) => id), ['a', 'b', 'c']);
});

test('request generation rejects results made stale by visibility or account changes', () => {
  const gate = new RequestGeneration();
  const first = gate.issue();
  assert.equal(gate.isCurrent(first), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  const second = gate.issue();
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.isCurrent(first), false);
});
