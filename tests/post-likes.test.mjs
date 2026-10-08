import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isDuplicateLikeError, postLikeSummaryIds } from '../src/features/posts/validation.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20261008120000_post_likes_foundation.sql', import.meta.url),
  'utf8',
);
const securityPatch = readFileSync(
  new URL('../supabase/migrations/20261008170000_post_likes_owner_read_patch.sql', import.meta.url),
  'utf8',
);
const service = readFileSync(new URL('../src/features/posts/likes-service.ts', import.meta.url), 'utf8');
const postsMigration = readFileSync(
  new URL('../supabase/migrations/20261005182705_posts_media_foundation.sql', import.meta.url),
  'utf8',
);

test('migration enforces one like per user and cascading ownership relationships', () => {
  assert.match(migration, /primary key \(post_id, user_id\)/i);
  assert.match(migration, /post_id uuid not null references public\.posts\(id\) on delete cascade/i);
  assert.match(migration, /user_id uuid not null default auth\.uid\(\) references public\.profiles\(id\) on delete cascade/i);
  assert.match(migration, /create index post_likes_user_id_idx on public\.post_likes \(user_id, post_id\)/i);
});

test('RLS exposes only the caller own rows and restricts inserts and deletes to auth.uid()', () => {
  assert.match(migration, /alter table public\.post_likes enable row level security/i);
  assert.match(migration, /grant select \(post_id\), delete on public\.post_likes to authenticated/i);
  assert.match(migration, /grant insert \(post_id\) on public\.post_likes to authenticated/i);
  assert.match(securityPatch, /drop policy if exists post_likes_authenticated_read on public\.post_likes/i);
  assert.match(securityPatch, /post_likes_owner_read[\s\S]*user_id = \(select auth\.uid\(\)/i);
  assert.match(migration, /post_likes_owner_insert[\s\S]*user_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /post_likes_owner_delete[\s\S]*user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(`${migration}\n${securityPatch}`, /grant update/i);
});

test('aggregate RPC is authenticated, bounded, and returns no liker identity', () => {
  assert.match(migration, /returns table \(post_id uuid, like_count bigint, liked_by_me boolean\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /cardinality\(p_post_ids\) > 50/i);
  assert.match(migration, /revoke all on function public\.get_post_like_summaries\(uuid\[\]\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_post_like_summaries\(uuid\[\]\) to authenticated/i);
});

test('summary visibility matches the current authenticated feed policy', () => {
  assert.match(postsMigration, /posts_authenticated_read[\s\S]*to authenticated using \(true\)/i);
  assert.match(migration, /caller_id is null[\s\S]*errcode = '42501'/i);
  assert.match(migration, /from requested r[\s\S]*join public\.posts p on p\.id = r\.requested_post_id/i);
  assert.doesNotMatch(migration, /returns table \([^)]*user_id/i);
});

test('forward patch changes only the read policy and preserves deployed objects', () => {
  assert.doesNotMatch(securityPatch, /\b(create|alter|drop)\s+table\b/i);
  assert.doesNotMatch(securityPatch, /\b(create|alter|drop)\s+(or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(securityPatch, /\b(insert|update|delete|truncate)\s+(into|from|public\.)/i);
  assert.doesNotMatch(securityPatch, /\b(grant|revoke)\b/i);
  assert.match(securityPatch, /^--[^\n]*\nbegin;[\s\S]*commit;\s*$/i);
});

test('like summary requests validate, normalize, deduplicate, and enforce the page limit', () => {
  const upper = '00000000-0000-4000-8000-0000000000AA';
  assert.deepEqual(postLikeSummaryIds([upper, upper.toLowerCase()]), [upper.toLowerCase()]);
  assert.throws(() => postLikeSummaryIds(['not-a-uuid']));
  assert.throws(() => postLikeSummaryIds(Array.from({ length: 51 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)));
});

test('service operations are idempotent and never submit a user identity', () => {
  assert.match(service, /from\('post_likes'\)\.insert\(\{ post_id:/);
  assert.match(service, /error && !isDuplicateLikeError\(error\)/);
  assert.match(service, /from\('post_likes'\)\.delete\(\)\.eq\('post_id'/);
  assert.doesNotMatch(service, /user_id\s*:/);
  assert.doesNotMatch(service, /\.single\(\)/);
});

test('only a unique-constraint violation is accepted as an idempotent like replay', () => {
  assert.equal(isDuplicateLikeError({ code: '23505' }), true);
  assert.equal(isDuplicateLikeError({ code: '42501' }), false);
  assert.equal(isDuplicateLikeError({ code: '23503' }), false);
  assert.equal(isDuplicateLikeError(null), false);
});
