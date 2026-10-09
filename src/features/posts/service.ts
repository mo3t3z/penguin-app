import { supabase } from '@/lib/supabase';
import { postSearchPatterns, termsFromKey } from '@/features/discover/search-query';
import { feedCursorFilter, normalizePostContent, requireUuid } from './validation';
import { buildFeedPage, type FeedCursor, type FeedPost } from './feed';

function client() {
  if (!supabase) throw new Error('Post data is not configured.');
  return supabase;
}

// Only presentation fields, never auth metadata or complete profile records.
const POST_CARD = `
  id,author_id,content,created_at,updated_at,
  author:profiles!posts_author_id_fkey(id,username,display_name,avatar_url),
  media:post_media(id,post_id,mime_type,size_bytes,width,height,position,status,created_at)
` as const;

const CREATE_POST_TIMEOUT_MS = 20_000;

export class CreatePostTimeoutError extends Error {
  constructor() {
    super('Create post request timed out.');
    this.name = 'CreatePostTimeoutError';
  }
}

function createPostDebug(stage: string, details?: Record<string, unknown>) {
  if (__DEV__) console.info(`[createPost] ${stage}`, details ?? '');
}

export async function createPost(content: string, clientRequestId: string) {
  // The invoker-rights RPC uses auth.uid(), existing RLS and the per-author
  // request key. No client-provided author identity is accepted.
  const normalized = normalizePostContent(content);
  const requestId = requireUuid(clientRequestId);
  const requestSuffix = requestId.slice(-8);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      createPostDebug('deadline reached', { requestSuffix });
      controller.abort();
      reject(new CreatePostTimeoutError());
    }, CREATE_POST_TIMEOUT_MS);
  });
  createPostDebug('Supabase request start', { requestSuffix });
  const request = client().rpc('create_post_idempotent', {
    p_content: normalized,
    p_client_request_id: requestId,
  }).abortSignal(controller.signal).single();
  try {
    const { data, error, status } = await Promise.race([request, deadline]);
    createPostDebug('Supabase response', { requestSuffix, status, ok: !error, errorCode: error?.code ?? null });
    if (error) throw error;
    if (data.idempotent_replay) createPostDebug('idempotent replay recovered', { requestSuffix });
    return data;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
export async function getPost(id: string) {
  const { data, error } = await client().from('posts').select(POST_CARD).eq('id', requireUuid(id))
    .order('position', { referencedTable: 'media' }).maybeSingle();
  if (error) throw error;
  return data;
}
// With authorId the same newest-first cursor pagination is limited to one student's
// posts; row-level security still decides which posts the caller may read.
// With search (a canonical search key) only posts whose text contains every word
// are returned, in the same order and with the same cursor.
export async function getFeed({ cursor, limit = 20, signal, authorId, search }: {
  cursor?: FeedCursor;
  limit?: number;
  signal?: AbortSignal;
  authorId?: string | null;
  search?: string | null;
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Feed limit must be between 1 and 50.');
  let query = client().from('posts').select(POST_CARD)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .eq('media.status', 'ready')
    .order('position', { referencedTable: 'media' }).limit(limit + 1);
  if (authorId) query = query.eq('author_id', requireUuid(authorId));
  if (search) for (const pattern of postSearchPatterns(termsFromKey(search))) query = query.ilike('content', pattern);
  if (cursor) query = query.or(feedCursorFilter(cursor));
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return buildFeedPage(data as FeedPost[], limit);
}
export async function updatePost(id: string, content: string) {
  const { data, error } = await client().from('posts').update({ content: normalizePostContent(content) })
    .eq('id', requireUuid(id)).select('id,author_id,content,created_at,updated_at').single();
  if (error) throw error; // RLS-denied/missing rows cannot masquerade as success.
  return data;
}
export async function deletePost(id: string) {
  const { data, error } = await client().from('posts').delete().eq('id', requireUuid(id)).select('id').single();
  if (error) throw error;
  return data;
}
export type PostCard = NonNullable<Awaited<ReturnType<typeof getPost>>>;
export type { FeedAuthor, FeedCursor, FeedMedia, FeedPage, FeedPost } from './feed';
