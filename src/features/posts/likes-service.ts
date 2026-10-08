import { supabase } from '@/lib/supabase';
import type { PostLikeSummary } from '@/lib/database.types';
import { isDuplicateLikeError, postLikeSummaryIds, requireUuid } from './validation';

function client() {
  if (!supabase) throw new Error('Post likes are not configured.');
  return supabase;
}

export async function likePost(postId: string): Promise<void> {
  // A plain insert uses the database-owned auth.uid() default and requires
  // only INSERT(post_id). The composite primary key makes retries detectable.
  const { error } = await client().from('post_likes').insert({ post_id: requireUuid(postId) });
  if (error && !isDuplicateLikeError(error)) throw error;
}

export async function unlikePost(postId: string): Promise<void> {
  const { error } = await client().from('post_likes').delete().eq('post_id', requireUuid(postId));
  if (error) throw error;
}

export async function getPostLikeSummaries(
  postIds: readonly string[],
  options: { signal?: AbortSignal } = {},
): Promise<PostLikeSummary[]> {
  const requested = postLikeSummaryIds(postIds);
  if (!requested.length) return [];
  let request = client().rpc('get_post_like_summaries', { p_post_ids: requested });
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
