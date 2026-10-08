import type { Post, PostMediaRecord, Profile } from '../../lib/database.types';

export type FeedAuthor = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type FeedMedia = Pick<PostMediaRecord,
  'id' | 'post_id' | 'mime_type' | 'size_bytes' | 'width' | 'height' | 'position' | 'status' | 'created_at'>;
export type FeedPost = Pick<Post, 'id' | 'author_id' | 'content' | 'created_at' | 'updated_at'> & {
  author: FeedAuthor | null;
  media: FeedMedia[];
};
export type FeedCursor = { createdAt: string; id: string };
export type FeedPage = { items: FeedPost[]; nextCursor: FeedCursor | null };
export type FeedStatus = 'idle' | 'loading' | 'empty' | 'ready' | 'error';
export type FeedErrorKind = 'refresh' | 'load-more' | null;
export type FeedState = {
  userId: string | null;
  status: FeedStatus;
  items: FeedPost[];
  nextCursor: FeedCursor | null;
  loadingMore: boolean;
  error: string | null;
  errorKind: FeedErrorKind;
};

export const initialFeedState = (): FeedState => ({
  userId: null,
  status: 'idle',
  items: [],
  nextCursor: null,
  loadingMore: false,
  error: null,
  errorKind: null,
});

export function beginFeedLoad(current: FeedState, userId: string, append: boolean): FeedState {
  if (current.userId === userId && current.items.length) {
    return { ...current, status: 'ready', loadingMore: append, error: null, errorKind: null };
  }
  return { userId, status: 'loading', items: [], nextCursor: null, loadingMore: false, error: null, errorKind: null };
}

export function failFeedLoad(
  current: FeedState,
  userId: string,
  append: boolean,
  message: string,
): FeedState {
  if (current.userId === userId && current.items.length) {
    return {
      ...current,
      status: 'ready',
      loadingMore: false,
      error: message,
      errorKind: append ? 'load-more' : 'refresh',
    };
  }
  return {
    userId,
    status: 'error',
    items: [],
    nextCursor: null,
    loadingMore: false,
    error: message,
    errorKind: append ? 'load-more' : 'refresh',
  };
}

export function buildFeedPage(rows: FeedPost[], limit: number): FeedPage {
  const items = rows.slice(0, limit).map((post) => ({
    ...post,
    // RLS is authoritative. Keep this defense in depth so callers never receive
    // an unexpected unfinished row if a mocked or future backend response drifts.
    media: post.media
      .filter((item) => item.status === 'ready')
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)),
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export function mergeFeedPosts(current: FeedPost[], next: FeedPost[]) {
  const seen = new Set(current.map(({ id }) => id));
  const merged = [...current];
  for (const post of next) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged;
}

function sameAuthor(left: FeedAuthor | null, right: FeedAuthor | null) {
  return left === right || Boolean(left && right
    && left.id === right.id
    && left.username === right.username
    && left.display_name === right.display_name
    && left.avatar_url === right.avatar_url);
}

function sameMedia(left: FeedMedia[], right: FeedMedia[]) {
  return left.length === right.length && left.every((item, index) => {
    const next = right[index];
    return item.id === next.id
      && item.post_id === next.post_id
      && item.mime_type === next.mime_type
      && item.size_bytes === next.size_bytes
      && item.width === next.width
      && item.height === next.height
      && item.position === next.position
      && item.status === next.status
      && item.created_at === next.created_at;
  });
}

export function reconcileFeedPosts(current: FeedPost[], next: FeedPost[]) {
  const existing = new Map(current.map((post) => [post.id, post]));
  return next.map((post) => {
    const previous = existing.get(post.id);
    return previous
      && previous.author_id === post.author_id
      && previous.content === post.content
      && previous.created_at === post.created_at
      && previous.updated_at === post.updated_at
      && sameAuthor(previous.author, post.author)
      && sameMedia(previous.media, post.media)
      ? previous
      : post;
  });
}

export function feedRequestKey(cursor?: FeedCursor) {
  return cursor ? `page:${cursor.createdAt}:${cursor.id}` : 'refresh';
}

export class FeedRequestRegistry {
  private active = new Set<string>();

  begin(key: string) {
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  has(key: string) {
    return this.active.has(key);
  }

  finish(key: string) {
    this.active.delete(key);
  }

  clear() {
    this.active.clear();
  }
}
