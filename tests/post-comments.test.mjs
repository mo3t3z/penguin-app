import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildCommentPage,
  commentCursorFilter,
  normalizeCommentContent,
  postCommentCountIds,
} from '../src/features/comments/comments.ts';

const migration = readFileSync(
  new URL('../supabase/migrations/20261008190000_post_comments_foundation.sql', import.meta.url),
  'utf8',
);
const hotfix = readFileSync(
  new URL('../supabase/migrations/20261008233000_comment_rpc_conflict_target_fix.sql', import.meta.url),
  'utf8',
);
const service = readFileSync(new URL('../src/features/comments/service.ts', import.meta.url), 'utf8');
const integration = readFileSync(new URL('./post-comments-integration.sql', import.meta.url), 'utf8');
const author = { id: '00000000-0000-4000-8000-000000000091', username: 'student', display_name: 'Student', avatar_url: null };
const postId = '00000000-0000-4000-8000-000000000010';
function comment(id, createdAt) {
  return { id, post_id: postId, author_id: author.id, content: id, created_at: createdAt, updated_at: createdAt, author };
}

test('comments schema enforces ownership, cascading posts, timestamps, and useful length', () => {
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(migration, /post_id uuid not null references public\.posts\(id\) on delete cascade/i);
  assert.match(migration, /author_id uuid not null default auth\.uid\(\) references public\.profiles\(id\) on delete cascade/i);
  assert.match(migration, /char_length\(content\) between 1 and 1000 and content ~ '\[\^\[:space:\]\]'/i);
  assert.match(migration, /created_at timestamptz not null default now\(\)[\s\S]*updated_at timestamptz not null default now\(\)/i);
});

test('RLS follows post visibility and permits only self insert and delete', () => {
  assert.match(migration, /alter table public\.post_comments enable row level security/i);
  assert.match(migration, /post_comments_visible_read[\s\S]*exists \(select 1 from public\.posts p where p\.id = post_id\)/i);
  assert.match(migration, /post_comments_owner_insert[\s\S]*author_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /post_comments_owner_delete[\s\S]*author_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /grant insert \(id, post_id, content\)/i);
  assert.doesNotMatch(migration, /grant update/i);
  assert.doesNotMatch(migration, /create policy [^\n]*update/i);
});

test('indexes support stable post pagination and author cleanup', () => {
  assert.match(migration, /post_comments_post_cursor_idx[\s\S]*\(post_id, created_at desc, id desc\)/i);
  assert.match(migration, /post_comments_author_idx[\s\S]*\(author_id, id\)/i);
});

test('creation uses the client comment UUID as an idempotency key', () => {
  assert.match(migration, /create function public\.create_post_comment_idempotent\([\s\S]*p_comment_id uuid/i);
  assert.match(migration, /insert into public\.post_comments as inserted_comment \(id, post_id, content\)/i);
  assert.match(migration, /on conflict \(id\) do nothing/i);
  assert.match(migration, /existing\.author_id is distinct from \(select auth\.uid\(\)\)/i);
  assert.match(service, /p_comment_id: requireUuid\(commentId\)/);
  assert.doesNotMatch(service, /author_id\s*:/);
});

test('forward hotfix targets the generated primary-key constraint without changing function security', () => {
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/i);
  assert.match(hotfix, /create or replace function public\.create_post_comment_idempotent/i);
  assert.match(hotfix, /on conflict on constraint post_comments_pkey do nothing/i);
  assert.doesNotMatch(hotfix, /on conflict \(id\) do nothing/i);
  assert.match(hotfix, /language plpgsql[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.match(hotfix, /existing\.author_id is distinct from \(select auth\.uid\(\)\)/i);
  assert.match(hotfix, /existing\.post_id is distinct from p_post_id[\s\S]*existing\.content is distinct from p_content/i);
  assert.match(hotfix, /revoke all on function public\.create_post_comment_idempotent\(uuid, uuid, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(hotfix, /grant execute on function public\.create_post_comment_idempotent\(uuid, uuid, text\)[\s\S]*to authenticated/i);
});

test('remaining comment RPC column references are qualified against output-variable ambiguity', () => {
  assert.match(hotfix, /returning inserted_comment\.id, inserted_comment\.post_id, inserted_comment\.author_id/i);
  assert.match(hotfix, /select pc\.\* into existing[\s\S]*where pc\.id = p_comment_id/i);
  assert.match(hotfix, /return query select existing\.id, existing\.post_id, existing\.author_id/i);
});

test('hotfix preserves the complete deployed function body except for the conflict target', () => {
  const bodyPattern = /create(?: or replace)? function public\.create_post_comment_idempotent[\s\S]*?as \$\$([\s\S]*?)\$\$;/i;
  const deployedBody = migration.match(bodyPattern)?.[1];
  const fixedBody = hotfix.match(bodyPattern)?.[1];
  assert.ok(deployedBody);
  assert.ok(fixedBody);
  assert.equal(
    fixedBody.trim(),
    deployedBody.replace(
      /on conflict \(id\) do nothing/i,
      'on conflict on constraint post_comments_pkey do nothing',
    ).trim(),
  );
});

test('comment count RPC remains behind caller RLS and has narrow execution grants', () => {
  assert.match(migration, /get_post_comment_counts[\s\S]*security invoker[\s\S]*set search_path = ''/i);
  assert.match(migration, /join public\.posts p on p\.id = r\.requested_post_id/i);
  assert.match(migration, /left join public\.post_comments pc on pc\.post_id = p\.id/i);
  assert.match(migration, /cardinality\(p_post_ids\) > 50/i);
  assert.match(migration, /revoke all on function public\.get_post_comment_counts\(uuid\[\]\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_post_comment_counts\(uuid\[\]\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test('comment content validation trims text and rejects empty or oversized values', () => {
  assert.equal(normalizeCommentContent('  hello campus  '), 'hello campus');
  assert.throws(() => normalizeCommentContent(' \n\t '));
  assert.throws(() => normalizeCommentContent('x'.repeat(1001)));
});

test('comment pagination is stable for equal timestamps', () => {
  const rows = [
    comment('00000000-0000-4000-8000-000000000003', '2026-10-08T10:00:00.123456+00:00'),
    comment('00000000-0000-4000-8000-000000000002', '2026-10-08T10:00:00.123456+00:00'),
    comment('00000000-0000-4000-8000-000000000001', '2026-10-08T09:00:00+00:00'),
  ];
  const page = buildCommentPage(rows, 2);
  assert.deepEqual(page.items.map(({ id }) => id), [rows[0].id, rows[1].id]);
  assert.deepEqual(page.nextCursor, { createdAt: rows[1].created_at, id: rows[1].id });
  assert.equal(commentCursorFilter(page.nextCursor),
    `created_at.lt.${rows[1].created_at},and(created_at.eq.${rows[1].created_at},id.lt.${rows[1].id})`);
});

test('count request validation deduplicates IDs and enforces the RPC bound', () => {
  const upper = '00000000-0000-4000-8000-0000000000AA';
  assert.deepEqual(postCommentCountIds([upper, upper.toLowerCase()]), [upper.toLowerCase()]);
  assert.throws(() => postCommentCountIds(['invalid']));
  assert.throws(() => postCommentCountIds(Array.from({ length: 51 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)));
});

test('service uses stable ordering, bounded pages, abort signals, and idempotent delete semantics', () => {
  const deleteService = service.slice(
    service.indexOf('export async function deleteOwnedComment'),
    service.indexOf('export async function getComments'),
  );
  assert.match(service, /order\('created_at', \{ ascending: false \}\)[\s\S]*order\('id', \{ ascending: false \}\)/);
  assert.match(service, /limit\(limit \+ 1\)/);
  assert.match(service, /limit < 1 \|\| limit > 50/);
  assert.match(service, /request = request\.abortSignal\(signal\)/);
  assert.match(service, /from\('post_comments'\)\.delete\(\)[\s\S]*\.select\('id'\)/);
  assert.match(service, /return data\.length > 0/);
  assert.doesNotMatch(deleteService, /\.single\(\)/);
});

test('database integration script covers two accounts, ownership, retries, and hidden posts', () => {
  assert.match(integration, /exception when sqlstate '42702'/i);
  assert.match(integration, /20261008233000_comment_rpc_conflict_target_fix\.sql/i);
  assert.match(integration, /request\.jwt\.claim\.sub'[\s\S]*00000000-0000-4000-8000-000000000001/i);
  assert.match(integration, /request\.jwt\.claim\.sub'[\s\S]*00000000-0000-4000-8000-000000000002/i);
  assert.match(integration, /another user must not delete the comment/i);
  assert.match(integration, /same comment UUID must replay without a duplicate row/i);
  assert.match(integration, /conflicting retry unexpectedly succeeded/i);
  assert.match(integration, /another user reused the comment UUID/i);
  assert.match(integration, /count RPC must hide posts excluded by caller RLS/i);
});
