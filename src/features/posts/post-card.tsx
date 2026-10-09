import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { IdentityRow } from '@/components/social/identity-row';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Heart, MessageCircle } from 'lucide-react-native';
import type { FeedPost } from './feed';
import type { PostLikeState } from './likes';
import type { CommentCountState } from '../comments/comment-counts';
import { PostMediaGrid } from './post-media-grid';
import { publicationAccessibilityLabel, relativePublicationTime } from './post-presentation';

type PostCardProps = {
  post: FeedPost;
  visible: boolean;
  likeState?: PostLikeState;
  commentCount?: CommentCountState;
  onToggleLike: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  // When set, the author's avatar and name open their profile.
  onOpenAuthor?: (authorId: string) => void;
};

// 44px-high actions per Figma; the vertical hitSlop gives a 48px touch target.
const actionHitSlop = { top: 2, bottom: 2 };

function PostCardComponent({ post, visible, likeState, commentCount, onToggleLike, onOpenComments, onOpenAuthor }: PostCardProps) {
  const name = post.author?.display_name?.trim() || 'Penguin student';
  const username = post.author?.username?.trim() || 'student';
  const avatar = post.author?.avatar_url?.trim() || null;
  const likesUnavailable = !likeState || likeState.count === null;
  const likeDisabled = likesUnavailable || likeState.pending;
  const liked = likeState?.likedByMe ?? false;
  const likeCount = likeState?.count ?? null;
  const comments = commentCount?.count ?? null;
  return <View className="gap-[14px] rounded-lg border border-border bg-card p-4" accessibilityLabel={`Post by ${name}`}>
    <IdentityRow
      name={name}
      username={username}
      avatarUrl={avatar}
      time={relativePublicationTime(post.created_at)}
      timeAccessibilityLabel={publicationAccessibilityLabel(post.created_at)}
      onPress={onOpenAuthor ? () => onOpenAuthor(post.author_id) : undefined}
    />
    <Text selectable className="text-metadata">{post.content}</Text>
    <PostMediaGrid media={post.media} visible={visible} />
    <View className="flex-row items-center gap-[18px]">
      <Pressable
        className={cn('min-h-11 min-w-12 flex-row items-center gap-1.5', likesUnavailable && 'opacity-50')}
        role="button"
        hitSlop={actionHitSlop}
        disabled={likeDisabled}
        onPress={() => onToggleLike(post.id)}
        accessibilityLabel={likesUnavailable
          ? 'Likes unavailable'
          : `${liked ? 'Unlike' : 'Like'} this post. ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
        accessibilityState={{ selected: liked, busy: likeState?.pending ?? false, disabled: likeDisabled }}
      >
        <Icon as={Heart} color={liked ? 'primary' : 'muted-foreground'} filled={liked} />
        <Text className={cn('text-caption', liked ? 'font-inter-semibold text-primary' : 'text-muted-foreground')}>
          {likeCount === null ? '—' : likeCount === 0 ? 'Like' : likeCount}
        </Text>
      </Pressable>
      <Pressable
        className="min-h-11 min-w-12 flex-row items-center gap-1.5"
        role="button"
        hitSlop={actionHitSlop}
        onPress={() => onOpenComments(post.id)}
        accessibilityLabel={`Open comments. ${comments ?? 'Count unavailable'}${comments === 1 ? ' comment' : comments === null ? '' : ' comments'}`}
      >
        <Icon as={MessageCircle} color="muted-foreground" />
        <Text className="text-caption text-muted-foreground">
          {comments === null ? '—' : comments === 0 ? 'Comment' : comments}
        </Text>
      </Pressable>
      {likeState?.error ? (
        <Text variant="caption" className="min-w-0 flex-1 text-right text-muted-foreground" accessibilityLiveRegion="polite">
          {likeState.error}
        </Text>
      ) : null}
    </View>
  </View>;
}

export const PostCard = memo(PostCardComponent);
