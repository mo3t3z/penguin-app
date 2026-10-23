import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { notificationAge, notificationSentence, notificationTarget } from '../src/features/notifications/notification-text.ts';

const post = '00000000-0000-4000-8000-000000000p01'.replace('p', '0');
const actor = '00000000-0000-4000-8000-0000000000a1';

test('every notice type has a sentence', () => {
  assert.deepEqual(Object.keys(notificationSentence).sort(),
    ['connection_accepted', 'connection_comment', 'connection_photo', 'connection_request', 'post_comment']);
});

test('tapping a notice opens what it is about', () => {
  assert.deepEqual(notificationTarget({ type: 'post_comment', post_id: post, actor_id: actor }), { kind: 'post', postId: post });
  assert.deepEqual(notificationTarget({ type: 'connection_comment', post_id: post, actor_id: actor }), { kind: 'post', postId: post });
  assert.deepEqual(notificationTarget({ type: 'connection_photo', post_id: post, actor_id: actor }), { kind: 'post', postId: post });
  assert.deepEqual(notificationTarget({ type: 'connection_request', post_id: null, actor_id: actor }), { kind: 'requests' });
  assert.deepEqual(notificationTarget({ type: 'connection_accepted', post_id: null, actor_id: actor }), { kind: 'profile', profileId: actor });
  assert.equal(notificationTarget({ type: 'post_comment', post_id: null, actor_id: actor }), null);
});

test('ages are short', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  assert.equal(notificationAge('2026-10-24T11:59:40Z', now), 'now');
  assert.equal(notificationAge('2026-10-24T11:55:00Z', now), '5m');
  assert.equal(notificationAge('2026-10-24T09:00:00Z', now), '3h');
  assert.equal(notificationAge('2026-10-22T12:00:00Z', now), '2d');
  assert.equal(notificationAge('2026-10-01T12:00:00Z', now), 'Oct 1');
});

test('clients can only read their notices; triggers write them', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261024090000_notifications.sql', import.meta.url), 'utf8');
  assert.match(sql, /revoke all on public\.notifications from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*on public\.notifications to authenticated/);
  assert.match(sql, /using \(recipient_id = \(select auth\.uid\(\)\)\)/);
});

test('Home has the notifications bell; the profile has none', () => {
  const home = readFileSync(new URL('../src/app/(protected)/(tabs)/home.tsx', import.meta.url), 'utf8');
  assert.match(home, /<TopBar actions=\{<NotificationsBell \/>\} \/>/);
  const account = readFileSync(new URL('../src/app/(protected)/(tabs)/account.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(account, /Bell/);
});
