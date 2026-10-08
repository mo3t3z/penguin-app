import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beginFeedLoad, initialFeedState } from '../src/features/posts/feed.ts';
import {
  markPostLikesUnavailable,
  mergePostLikeSummaries,
  optimisticPostLikeToggle,
  PostLikeMutationRegistry,
  retainPostLikeStates,
  rollbackPostLike,
  settlePostLike,
} from '../src/features/posts/likes.ts';

const postA = '00000000-0000-4000-8000-000000000001';
const postB = '00000000-0000-4000-8000-000000000002';
const postC = '00000000-0000-4000-8000-000000000003';
const userA = '00000000-0000-4000-8000-000000000091';
const userB = '00000000-0000-4000-8000-000000000092';

test('summary hydration applies counts, liked state, and zero defaults', () => {
  const result = mergePostLikeSummaries({}, [postA, postB], [
    { post_id: postA, like_count: 3, liked_by_me: true },
  ]);
  assert.deepEqual(result[postA], { count: 3, likedByMe: true, pending: false, error: null });
  assert.deepEqual(result[postB], { count: 0, likedByMe: false, pending: false, error: null });
});

test('optimistic like and unlike update immediately then settle', () => {
  const liked = optimisticPostLikeToggle({ count: 2, likedByMe: false, pending: false, error: null });
  assert.deepEqual(liked, { count: 3, likedByMe: true, pending: true, error: null });
  assert.deepEqual(settlePostLike(liked), { count: 3, likedByMe: true, pending: false, error: null });
  const unliked = optimisticPostLikeToggle({ count: 3, likedByMe: true, pending: false, error: null });
  assert.deepEqual(unliked, { count: 2, likedByMe: false, pending: true, error: null });
});

test('failed mutation rolls back the exact prior value and exposes a retryable error', () => {
  const previous = { count: 7, likedByMe: true, pending: false, error: null };
  const rolledBack = rollbackPostLike(previous, 'Try again.');
  assert.deepEqual(rolledBack, { count: 7, likedByMe: true, pending: false, error: 'Try again.' });
});

test('pagination adds new summary state without replacing earlier state identity', () => {
  const first = mergePostLikeSummaries({}, [postA], [{ post_id: postA, like_count: 1, liked_by_me: false }]);
  const second = mergePostLikeSummaries(first, [postB], [{ post_id: postB, like_count: 2, liked_by_me: true }]);
  assert.strictEqual(second[postA], first[postA]);
  assert.equal(second[postB].count, 2);
});

test('refresh with unchanged summaries preserves per-post and map identity', () => {
  const current = mergePostLikeSummaries({}, [postA], [{ post_id: postA, like_count: 4, liked_by_me: true }]);
  const refreshed = mergePostLikeSummaries(current, [postA], [{ post_id: postA, like_count: 4, liked_by_me: true }]);
  assert.strictEqual(refreshed, current);
  assert.strictEqual(refreshed[postA], current[postA]);
});

test('a stale refresh cannot overwrite a newer optimistic mutation', () => {
  const pending = { count: 5, likedByMe: true, pending: true, error: null };
  const current = { [postA]: pending };
  const refreshed = mergePostLikeSummaries(
    current,
    [postA],
    [{ post_id: postA, like_count: 4, liked_by_me: false }],
    (_postId, state) => !state?.pending,
  );
  assert.strictEqual(refreshed, current);
  assert.strictEqual(refreshed[postA], pending);
});

test('like RPC failure preserves known values and marks only new posts unavailable', () => {
  const known = { count: 2, likedByMe: false, pending: false, error: null };
  const pending = markPostLikesUnavailable({ [postA]: known }, [postA, postB], null);
  const result = markPostLikesUnavailable(pending, [postA, postB], 'Unavailable');
  assert.strictEqual(result[postA], known);
  assert.deepEqual(result[postB], { count: null, likedByMe: false, pending: false, error: 'Unavailable' });
});

test('refresh pruning removes stale like entries while retaining visible state identity', () => {
  const stateA = { count: 1, likedByMe: true, pending: false, error: null };
  const stateB = { count: 2, likedByMe: false, pending: false, error: null };
  const result = retainPostLikeStates({ [postA]: stateA, [postB]: stateB, [postC]: stateB }, [postA, postB]);
  assert.deepEqual(Object.keys(result), [postA, postB]);
  assert.strictEqual(result[postA], stateA);
  assert.strictEqual(result[postB], stateB);
});

test('mutation registry prevents duplicate taps per user and isolates accounts', () => {
  const registry = new PostLikeMutationRegistry();
  assert.equal(registry.begin(userA, postA), true);
  assert.equal(registry.begin(userA, postA), false);
  assert.equal(registry.begin(userB, postA), true);
  registry.finish(userA, postA);
  assert.equal(registry.begin(userA, postA), true);
});

test('switching accounts clears all feed and like state', () => {
  const current = {
    ...initialFeedState(),
    userId: userA,
    status: 'ready',
    items: [{ id: postA }],
    likesByPostId: { [postA]: { count: 1, likedByMe: true, pending: false, error: null } },
  };
  const switched = beginFeedLoad(current, userB, false);
  assert.equal(switched.userId, userB);
  assert.deepEqual(switched.items, []);
  assert.deepEqual(switched.likesByPostId, {});
});
