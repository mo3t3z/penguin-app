import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { canonicalPair, connectionStateFor, otherInPair } from '../src/features/connections/connection-state.ts';
import { joinedMonthLabel, MAX_INTERESTS, normalizeCoverUrl, normalizeInterests } from '../src/features/profile/profile-format.ts';

const me = '00000000-0000-4000-8000-000000000001';
const them = '00000000-0000-4000-8000-000000000002';

test('connection state from the viewer side', () => {
  assert.equal(connectionStateFor(null, me), 'none');
  assert.equal(connectionStateFor({ requester_id: me, status: 'pending' }, me), 'outgoing');
  assert.equal(connectionStateFor({ requester_id: them, status: 'pending' }, me), 'incoming');
  assert.equal(connectionStateFor({ requester_id: them, status: 'accepted' }, me), 'connected');
  // A declined request can be sent again, by either student.
  assert.equal(connectionStateFor({ requester_id: me, status: 'declined' }, me), 'none');
  assert.equal(connectionStateFor({ requester_id: them, status: 'declined' }, me), 'none');
});

test('pairs are stored in canonical order', () => {
  assert.deepEqual(canonicalPair(them, me), { low: me, high: them });
  assert.deepEqual(canonicalPair(me, them), { low: me, high: them });
  assert.equal(otherInPair({ user_low: me, user_high: them }, me), them);
  assert.equal(otherInPair({ user_low: me, user_high: them }, them), me);
});

test('interests are trimmed, deduplicated and capped', () => {
  assert.deepEqual(normalizeInterests([' Web  Development ', 'web development', '', 'Gaming']), ['Web Development', 'Gaming']);
  assert.throws(() => normalizeInterests(['x'.repeat(33)]), /32 characters/);
  assert.throws(() => normalizeInterests(Array.from({ length: MAX_INTERESTS + 1 }, (_, index) => `topic ${index}`)), /up to 8/);
});

test('cover links must be https', () => {
  assert.equal(normalizeCoverUrl('  '), null);
  assert.equal(normalizeCoverUrl(null), null);
  assert.equal(normalizeCoverUrl(' https://example.com/cover.jpg '), 'https://example.com/cover.jpg');
  assert.throws(() => normalizeCoverUrl('http://example.com/cover.jpg'), /https/);
  assert.throws(() => normalizeCoverUrl('https://example.com/a b.jpg'), /https/);
});

test('short join label', () => {
  assert.equal(joinedMonthLabel('2024-09-15T12:00:00Z'), 'Joined Sep 2024');
  assert.equal(joinedMonthLabel(null), null);
});

test('migration keeps the verified badge out of client hands', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261023090000_profile_connections.sql', import.meta.url), 'utf8');
  const grant = sql.match(/grant update \(([^)]*)\) on public\.profiles to authenticated/);
  assert.ok(grant, 'profile update grant present');
  assert.ok(!grant[1].includes('is_verified'));
  assert.match(sql, /revoke all on public\.connections from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*on public\.connections to authenticated/);
});
