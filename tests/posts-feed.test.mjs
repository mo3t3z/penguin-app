import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  beginFeedLoad,
  buildFeedPage,
  feedRequestKey,
  FeedRequestRegistry,
  failFeedLoad,
  initialFeedState,
  mergeFeedPosts,
  reconcileFeedPosts,
} from '../src/features/posts/feed.ts';
import { feedCursorFilter } from '../src/features/posts/validation.ts';

const author = { id: '00000000-0000-4000-8000-000000000090', username: 'student', display_name: 'Student', avatar_url: null };

test('protected feed and comments routes share a stack that preserves the covered feed screen', () => {
  const layout = readFileSync(new URL('../src/app/(protected)/_layout.tsx', import.meta.url), 'utf8');
  const feed = readFileSync(new URL('../src/features/posts/feed-list.tsx', import.meta.url), 'utf8');
  assert.match(layout, /import\s*\{\s*Stack\s*\}\s*from\s*['"]expo-router['"]/);
  assert.match(layout, /<Stack\b/);
  assert.doesNotMatch(layout, /\bSlot\b/);
  assert.doesNotMatch(feed, /useFocusEffect|addListener\s*\(\s*['"]focus['"]/);
});
function post(id, createdAt, media = []) {
  return { id, author_id: author.id, content: id, created_at: createdAt, updated_at: createdAt, author, media };
}
function media(id, position, status = 'ready') {
  return {
    id, post_id: '00000000-0000-4000-8000-000000000001', mime_type: 'image/jpeg', size_bytes: 100,
    width: status === 'ready' ? 10 : null, height: status === 'ready' ? 10 : null, position, status,
    created_at: '2026-10-08T10:00:00.000000+00:00',
  };
}

test('feed page preserves newest-first database order and creates a stable tie-break cursor', () => {
  const rows = [
    post('00000000-0000-4000-8000-000000000003', '2026-10-08T10:00:00.123456+00:00'),
    post('00000000-0000-4000-8000-000000000002', '2026-10-08T10:00:00.123456+00:00'),
    post('00000000-0000-4000-8000-000000000001', '2026-10-08T09:00:00.000000+00:00'),
  ];
  const page = buildFeedPage(rows, 2);
  assert.deepEqual(page.items.map(({ id }) => id), [rows[0].id, rows[1].id]);
  assert.deepEqual(page.nextCursor, { createdAt: rows[1].created_at, id: rows[1].id });
  assert.equal(feedCursorFilter(page.nextCursor), `created_at.lt.${rows[1].created_at},and(created_at.eq.${rows[1].created_at},id.lt.${rows[1].id})`);
});

test('page merging keeps order and removes a repeated boundary post', () => {
  const first = [post('00000000-0000-4000-8000-000000000003', '2026-10-08T10:00:00Z'), post('00000000-0000-4000-8000-000000000002', '2026-10-08T09:00:00Z')];
  const second = [first[1], post('00000000-0000-4000-8000-000000000001', '2026-10-08T08:00:00Z')];
  assert.deepEqual(mergeFeedPosts(first, [...second, second[1]]).map(({ id }) => id), [first[0].id, first[1].id, second[1].id]);
});

test('an empty result has no cursor', () => {
  assert.deepEqual(buildFeedPage([], 20), { items: [], nextCursor: null });
});

test('only ready media is returned and it is ordered by position', () => {
  const ready0 = media('00000000-0000-4000-8000-000000000010', 0);
  const ready2 = media('00000000-0000-4000-8000-000000000012', 2);
  const pending = media('00000000-0000-4000-8000-000000000011', 1, 'pending');
  const page = buildFeedPage([post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00Z', [ready2, pending, ready0])], 20);
  assert.deepEqual(page.items[0].media.map(({ id, position, status }) => ({ id, position, status })), [
    { id: ready0.id, position: 0, status: 'ready' },
    { id: ready2.id, position: 2, status: 'ready' },
  ]);
});

test('refresh keeps existing same-account posts mounted while loading', () => {
  const existing = post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00Z');
  const current = {
    ...initialFeedState(),
    userId: author.id,
    status: 'ready',
    items: [existing],
    nextCursor: { createdAt: existing.created_at, id: existing.id },
  };
  const loading = beginFeedLoad(current, author.id, false);
  assert.equal(loading.status, 'ready');
  assert.strictEqual(loading.items, current.items);
  assert.equal(loading.loadingMore, false);
});

test('switching accounts clears feed comment counts', () => {
  const current = {
    ...initialFeedState(),
    userId: author.id,
    status: 'ready',
    items: [post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00Z')],
    commentCountsByPostId: {
      '00000000-0000-4000-8000-000000000001': { count: 3, error: null },
    },
  };
  const switched = beginFeedLoad(current, '00000000-0000-4000-8000-000000000099', false);
  assert.deepEqual(switched.commentCountsByPostId, {});
});

test('offline refresh retains posts and becomes a non-blocking refresh error', () => {
  const existing = post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00Z');
  const current = {
    ...initialFeedState(), userId: author.id, status: 'ready', items: [existing],
  };
  const failed = failFeedLoad(current, author.id, false, 'offline');
  assert.equal(failed.status, 'ready');
  assert.strictEqual(failed.items, current.items);
  assert.equal(failed.error, 'offline');
  assert.equal(failed.errorKind, 'refresh');
});

test('initial failure has no retained data and uses the full error state', () => {
  const failed = failFeedLoad(initialFeedState(), author.id, false, 'offline');
  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.items, []);
});

test('concurrent requests for the same cursor are accepted only once', () => {
  const registry = new FeedRequestRegistry();
  const cursor = { createdAt: '2026-10-08T10:00:00Z', id: '00000000-0000-4000-8000-000000000001' };
  const key = feedRequestKey(cursor);
  assert.equal(registry.begin(key), true);
  assert.equal(registry.begin(key), false);
  registry.finish(key);
  assert.equal(registry.begin(key), true);
});

test('refresh reconciliation preserves unchanged post identity and applies new ordering', () => {
  const older = post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00.123456Z');
  const sameTimestamp = post('00000000-0000-4000-8000-000000000002', '2026-10-08T10:00:00.123456Z');
  const refreshedOlder = { ...older, author: { ...older.author }, media: [...older.media] };
  const reconciled = reconcileFeedPosts([older], [sameTimestamp, refreshedOlder]);
  assert.deepEqual(reconciled.map(({ id }) => id), [sameTimestamp.id, older.id]);
  assert.strictEqual(reconciled[1], older);
});

test('refresh reconciliation replaces a changed post', () => {
  const current = post('00000000-0000-4000-8000-000000000001', '2026-10-08T10:00:00Z');
  const changed = { ...current, content: 'edited', updated_at: '2026-10-08T10:01:00Z' };
  assert.strictEqual(reconcileFeedPosts([current], [changed])[0], changed);
});
