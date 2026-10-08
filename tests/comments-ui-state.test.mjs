import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  beginCommentsLoad,
  CommentDeletionLocks,
  confirmCommentDeletion,
  failCommentsLoad,
  initialCommentsState,
  markCommentDeleting,
  mergeCommentPage,
  performLockedCommentDeletion,
  prepareCommentSubmitAttempt,
  reconcileComments,
  restoreDeletingComment,
} from '../src/features/comments/comments.ts';
import {
  adjustCommentCount,
  commentCountEvents,
  ensureCommentCounts,
  mergeCommentCounts,
  retainCommentCounts,
} from '../src/features/comments/comment-counts.ts';

const userA = '00000000-0000-4000-8000-000000000091';
const userB = '00000000-0000-4000-8000-000000000092';
const postA = '00000000-0000-4000-8000-000000000010';
const postB = '00000000-0000-4000-8000-000000000020';
const author = { id: userA, username: 'student', display_name: 'Student', avatar_url: null };
function comment(id, createdAt, overrides = {}) {
  return { id, post_id: postA, author_id: userA, content: id, created_at: createdAt, updated_at: createdAt, author, ...overrides };
}

test('unchanged comment submissions reuse the same UUID while edited drafts get a new one', () => {
  const ids = [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
  ];
  const first = prepareCommentSubmitAttempt(null, ' hello ', () => ids.shift());
  const retry = prepareCommentSubmitAttempt(first, 'hello', () => ids.shift());
  const changed = prepareCommentSubmitAttempt(first, 'hello again', () => ids.shift());
  assert.strictEqual(retry, first);
  assert.notEqual(changed.commentId, first.commentId);
});

test('offline refresh and pagination failures preserve existing comments', () => {
  const item = comment('00000000-0000-4000-8000-000000000101', '2026-10-08T10:00:00Z');
  const current = { ...initialCommentsState(), userId: userA, postId: postA, status: 'ready', items: [item] };
  const refreshing = beginCommentsLoad(current, userA, postA, false);
  const failedRefresh = failCommentsLoad(refreshing, userA, postA, false, 'offline');
  const failedPage = failCommentsLoad(current, userA, postA, true, 'offline');
  assert.strictEqual(refreshing.items, current.items);
  assert.strictEqual(failedRefresh.items, current.items);
  assert.equal(failedRefresh.errorKind, 'refresh');
  assert.strictEqual(failedPage.items, current.items);
  assert.equal(failedPage.errorKind, 'load-more');
});

test('pagination deduplicates boundary comments and refresh preserves pending optimistic comments', () => {
  const first = comment('00000000-0000-4000-8000-000000000103', '2026-10-08T10:00:00Z');
  const second = comment('00000000-0000-4000-8000-000000000102', '2026-10-08T09:00:00Z');
  const older = comment('00000000-0000-4000-8000-000000000101', '2026-10-08T08:00:00Z');
  assert.deepEqual(mergeCommentPage([first, second], [second, older]).map(({ id }) => id), [first.id, second.id, older.id]);
  const optimistic = comment('00000000-0000-4000-8000-000000000104', '2026-10-08T11:00:00Z', { optimistic: true });
  const refreshed = reconcileComments([optimistic, first], [{ ...first, author: { ...author } }]);
  assert.equal(refreshed[0].id, optimistic.id);
  assert.strictEqual(refreshed[1], first);
});

test('deletion keeps its row locked and can roll back to the exact list position', () => {
  const items = [
    comment('00000000-0000-4000-8000-000000000103', '2026-10-08T10:00:00Z'),
    comment('00000000-0000-4000-8000-000000000102', '2026-10-08T09:00:00Z'),
  ];
  const deletion = markCommentDeleting(items, items[0].id);
  assert.equal(deletion.items[0].deleting, true);
  assert.deepEqual(confirmCommentDeletion(deletion.items, items[0].id).map(({ id }) => id), [items[1].id]);
  assert.deepEqual(restoreDeletingComment(deletion.items, deletion.item, deletion.index), items);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('ten rapid delete taps issue one request and decrement the count once', async () => {
  const locks = new CommentDeletionLocks();
  const pending = deferred();
  let requests = 0;
  let count = 2;
  const options = {
    locks,
    userId: userA,
    commentId: '00000000-0000-4000-8000-000000000101',
    request: () => { requests += 1; return pending.promise; },
    onBegin: () => { count -= 1; },
    onSuccess: () => {},
    onFailure: () => { count += 1; },
  };
  const attempts = Array.from({ length: 10 }, () => performLockedCommentDeletion(options));
  assert.equal(requests, 1);
  assert.equal(count, 1);
  pending.resolve();
  assert.deepEqual(await Promise.all(attempts), ['deleted', ...Array(9).fill('ignored')]);
  assert.equal(count, 1);
});

test('failed deletion restores state and a subsequent retry succeeds', async () => {
  const locks = new CommentDeletionLocks();
  const original = comment('00000000-0000-4000-8000-000000000101', '2026-10-08T10:00:00Z');
  let items = [original];
  let count = 1;
  let fail = true;
  const run = () => performLockedCommentDeletion({
    locks,
    userId: userA,
    commentId: original.id,
    request: async () => { if (fail) throw new Error('offline'); },
    onBegin: () => { items = markCommentDeleting(items, original.id).items; count -= 1; },
    onSuccess: () => { items = confirmCommentDeletion(items, original.id); },
    onFailure: () => { items = restoreDeletingComment(items, original, 0); count += 1; },
  });
  assert.equal(await run(), 'failed');
  assert.deepEqual(items, [original]);
  assert.equal(count, 1);
  fail = false;
  assert.equal(await run(), 'deleted');
  assert.deepEqual(items, []);
  assert.equal(count, 0);
});

test('different comments delete independently and account cleanup does not leak locks', async () => {
  const locks = new CommentDeletionLocks();
  const first = deferred();
  const second = deferred();
  let requests = 0;
  const run = (userId, commentId, request) => performLockedCommentDeletion({
    locks, userId, commentId, request: () => { requests += 1; return request; },
    onBegin: () => {}, onSuccess: () => {}, onFailure: () => {},
  });
  const a = run(userA, '00000000-0000-4000-8000-000000000101', first.promise);
  const b = run(userA, '00000000-0000-4000-8000-000000000102', second.promise);
  assert.equal(requests, 2);
  locks.clear();
  const switched = run(userB, '00000000-0000-4000-8000-000000000101', Promise.resolve());
  assert.equal(requests, 3);
  first.resolve();
  second.resolve();
  assert.deepEqual(await Promise.all([a, b, switched]), ['deleted', 'deleted', 'deleted']);
});

test('comment counts hydrate, paginate, refresh, adjust, and retain identity', () => {
  const provisional = ensureCommentCounts({}, [postA, postB], null);
  const first = mergeCommentCounts(provisional, [postA], [{ post_id: postA, comment_count: 2 }]);
  const second = mergeCommentCounts(first, [postB], [{ post_id: postB, comment_count: 4 }]);
  assert.strictEqual(second[postA], first[postA]);
  const unchanged = mergeCommentCounts(second, [postA], [{ post_id: postA, comment_count: 2 }]);
  assert.strictEqual(unchanged, second);
  const adjusted = adjustCommentCount(second, postA, 1);
  assert.equal(adjusted[postA].count, 3);
  assert.equal(adjustCommentCount(adjusted, postA, -10)[postA].count, 0);
  assert.strictEqual(retainCommentCounts(second, [postA])[postA], second[postA]);
});

test('stale count responses can be skipped after an optimistic event', () => {
  const current = { [postA]: { count: 3, error: null } };
  const result = mergeCommentCounts(
    current,
    [postA],
    [{ post_id: postA, comment_count: 2 }],
    () => false,
  );
  assert.strictEqual(result, current);
});

test('comment count events retain account identity', () => {
  const received = [];
  const unsubscribe = commentCountEvents.subscribe((event) => received.push(event));
  commentCountEvents.publish({ userId: userA, postId: postA, delta: 1 });
  unsubscribe();
  commentCountEvents.publish({ userId: userB, postId: postA, delta: -1 });
  assert.deepEqual(received, [{ userId: userA, postId: postA, delta: 1 }]);
});

test('switching account or post clears comments', () => {
  const current = {
    ...initialCommentsState(),
    userId: userA,
    postId: postA,
    status: 'ready',
    items: [comment('00000000-0000-4000-8000-000000000101', '2026-10-08T10:00:00Z')],
  };
  assert.deepEqual(beginCommentsLoad(current, userB, postA, false).items, []);
  assert.deepEqual(beginCommentsLoad(current, userA, postB, false).items, []);
});
