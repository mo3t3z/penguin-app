import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IdentityRow } from '@/components/social/identity-row';
import { PostAction } from '@/components/social/post-action';
import { Text } from '@/components/ui/text';
import { shareText } from '@/lib/share-text';
import { cn } from '@/lib/utils';
import { Heart, MessageCircle, Share2 } from 'lucide-react-native';
import { isRightToLeft } from '@/features/chat/chat';
import type { FeedPost } from './feed';
import type { PostLikeState } from './likes';
import type { CommentCountState } from '../comments/comment-counts';
import { PostMediaGrid } from './post-media-grid';
import { isLongPost, POST_PREVIEW_LINES, publicationAccessibilityLabel, relativePublicationTime } from './post-presentation';

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

const rightToLeft = { textAlign: 'right', writingDirection: 'rtl' } as const;

// PostItem: a post in a feed, edge to edge on the page background with a divider
// below. No card, no shadow: the post is the interface. A long post shows its first
// lines with "Show more", so one post never pushes the rest of the feed away; once
// opened it stays open while the card is mounted.
function PostCardComponent({ post, visible, likeState, commentCount, onToggleLike, onOpenComments, onOpenAuthor }: PostCardProps) {
  const name = post.author?.display_name?.trim() || 'Penguin student';
  const username = post.author?.username?.trim() || 'student';
  const avatar = post.author?.avatar_url?.trim() || null;
  const likesUnavailable = !likeState || likeState.count === null;
  const likeDisabled = likesUnavailable || likeState.pending;
  const liked = likeState?.likedByMe ?? false;
  const likeCount = likeState?.count ?? null;
  const comments = commentCount?.count ?? null;
  const arabic = isRightToLeft(post.content);
  const long = isLongPost(post.content);
  const [expanded, setExpanded] = useState(false);
  return <View className="gap-3 border-b border-divider px-5 py-4" accessibilityLabel={`Post by ${name}`}>
    <IdentityRow
      name={name}
      username={username}
      avatarUrl={avatar}
      time={relativePublicationTime(post.created_at)}
      timeAccessibilityLabel={publicationAccessibilityLabel(post.created_at)}
      onPress={onOpenAuthor ? () => onOpenAuthor(post.author_id) : undefined}
    />
    <View>
      <Text
        selectable
        numberOfLines={long && !expanded ? POST_PREVIEW_LINES : undefined}
        className={arabic ? 'text-body-ar' : undefined}
        style={arabic ? rightToLeft : undefined}
      >{post.content}</Text>
      {long ? <Pressable
        className="min-h-11 justify-center self-start active:opacity-70"
        role="button"
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityLabel={expanded ? 'Show less of this post' : 'Show more of this post'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
      >
        <Text className="text-label font-inter-medium text-primary-text">{expanded ? 'Show less' : 'Show more'}</Text>
      </Pressable> : null}
    </View>
    <PostMediaGrid media={post.media} visible={visible} />
    <View className="-mx-3 flex-row items-center gap-2">
      <PostAction
        icon={Heart}
        className={cn(likesUnavailable && 'opacity-50')}
        active={liked}
        pop
        label={likeCount === null ? '—' : likeCount === 0 ? 'Like' : likeCount}
        disabled={likeDisabled}
        onPress={() => onToggleLike(post.id)}
        accessibilityLabel={likesUnavailable
          ? 'Likes unavailable'
          : `${liked ? 'Unlike' : 'Like'} this post. ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`}
        accessibilityState={{ selected: liked, busy: likeState?.pending ?? false, disabled: likeDisabled }}
      />
      <PostAction
        icon={MessageCircle}
        label={comments === null ? '—' : comments === 0 ? 'Comment' : comments}
        onPress={() => onOpenComments(post.id)}
        accessibilityLabel={`Open comments. ${comments ?? 'Count unavailable'}${comments === 1 ? ' comment' : comments === null ? '' : ' comments'}`}
      />
      <PostAction
        icon={Share2}
        onPress={() => void shareText(`${name} on Penguin: ${post.content}`)}
        accessibilityLabel="Share this post"
      />
      {likeState?.error ? (
        <Text variant="caption" className="min-w-0 flex-1 pr-3 text-right text-muted-foreground" accessibilityLiveRegion="polite">
          {likeState.error}
        </Text>
      ) : null}
    </View>
  </View>;
}

export const PostCard = memo(PostCardComponent);
