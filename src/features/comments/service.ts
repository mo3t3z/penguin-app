import { supabase } from '@/lib/supabase';
import type { PostCommentCount } from '@/lib/database.types';
import { requireUuid } from '@/features/posts/validation';
import {
  buildCommentPage,
  commentCursorFilter,
  normalizeCommentContent,
  postCommentCountIds,
  type CommentCursor,
  type CommentItem,
} from './comments';

function client() {
  if (!supabase) throw new Error('Post comments are not configured.');
  return supabase;
}

const COMMENT_CARD = `
  id,post_id,author_id,content,created_at,updated_at,
  author:profiles!post_comments_author_id_fkey(id,username,display_name,avatar_url)
` as const;

export async function createComment({ commentId, postId, content }: {
  commentId: string;
  postId: string;
  content: string;
}) {
  const { data, error } = await client().rpc('create_post_comment_idempotent', {
    p_comment_id: requireUuid(commentId),
    p_post_id: requireUuid(postId),
    p_content: normalizeCommentContent(content),
  }).single();
  if (error) throw error;
  return data;
}

export async function deleteOwnedComment(commentId: string): Promise<boolean> {
  const { data, error } = await client().from('post_comments').delete()
    .eq('id', requireUuid(commentId)).select('id');
  if (error) throw error;
  return data.length > 0;
}

export async function getComments({ postId, cursor, limit = 20, signal }: {
  postId: string;
  cursor?: CommentCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Comment page size must be between 1 and 50.');
  }
  let request = client().from('post_comments').select(COMMENT_CARD)
    .eq('post_id', requireUuid(postId))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (cursor) request = request.or(commentCursorFilter(cursor));
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildCommentPage(data as CommentItem[], limit);
}

export async function getPostCommentCounts(
  postIds: readonly string[],
  options: { signal?: AbortSignal } = {},
): Promise<PostCommentCount[]> {
  const requested = postCommentCountIds(postIds);
  if (!requested.length) return [];
  let request = client().rpc('get_post_comment_counts', { p_post_ids: requested });
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

export type { CommentCursor, CommentItem, CommentPage } from './comments';
