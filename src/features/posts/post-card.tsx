import { memo } from 'react';
import { View } from 'react-native';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Heart, MessageCircle } from 'lucide-react-native';
import type { FeedPost } from './feed';
import type { PostLikeState } from './likes';
import type { CommentCountState } from '../comments/comment-counts';
import { PostMediaGrid } from './post-media-grid';
import { publicationAccessibilityLabel, relativePublicationTime } from './post-presentation';

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

type PostCardProps = {
  post: FeedPost;
  visible: boolean;
  likeState?: PostLikeState;
  commentCount?: CommentCountState;
  onToggleLike: (postId: string) => void;
  onOpenComments: (postId: string) => void;
};

function PostCardComponent({ post, visible, likeState, commentCount, onToggleLike, onOpenComments }: PostCardProps) {
  const name = post.author?.display_name?.trim() || 'Penguin student';
  const username = post.author?.username?.trim() || 'student';
  const avatar = post.author?.avatar_url?.trim() || null;
  return <Card className="gap-0 py-0" accessibilityLabel={`Post by ${name}`}>
    <CardContent className="gap-4 px-4 py-4">
      <View className="flex-row items-center gap-3">
        <Avatar key={avatar ?? 'initials'} alt={`${name}'s avatar`} size="lg">
          {avatar ? <AvatarImage source={{ uri: avatar }} /> : null}
          <AvatarFallback className="bg-secondary">
            <Text className="font-semibold text-primary">{initialsFor(name)}</Text>
          </AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1">
          <Text variant="large" numberOfLines={1}>{name}</Text>
          <View className="flex-row items-center gap-2">
            <Text variant="muted" numberOfLines={1} className="shrink">@{username}</Text>
            <Text variant="muted" accessibilityElementsHidden>·</Text>
            <Text
              variant="muted"
              accessibilityLabel={publicationAccessibilityLabel(post.created_at)}
            >
              {relativePublicationTime(post.created_at)}
            </Text>
          </View>
        </View>
      </View>
      <Text selectable>{post.content}</Text>
      <PostMediaGrid media={post.media} visible={visible} />
      <View className="-ml-3 flex-row items-center justify-between gap-2">
        <View className="flex-row items-center">
        <Button
          variant="ghost"
          size="sm"
          disabled={!likeState || likeState.count === null || likeState.pending}
          onPress={() => onToggleLike(post.id)}
          accessibilityLabel={likeState?.count === null || !likeState
            ? 'Likes unavailable'
            : `${likeState.likedByMe ? 'Unlike' : 'Like'} this post. ${likeState.count} ${likeState.count === 1 ? 'like' : 'likes'}`}
          accessibilityState={{ selected: likeState?.likedByMe ?? false, busy: likeState?.pending ?? false }}
        >
          <Icon as={Heart} color={likeState?.likedByMe ? 'primary' : 'muted-foreground'} />
          <Text className={likeState?.likedByMe ? 'font-semibold text-primary' : 'text-muted-foreground'}>
            {likeState?.count ?? '—'}
          </Text>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={() => onOpenComments(post.id)}
          accessibilityLabel={`Open comments. ${commentCount?.count ?? 'Count unavailable'}${commentCount?.count === 1 ? ' comment' : commentCount?.count === null || !commentCount ? '' : ' comments'}`}
        >
          <Icon as={MessageCircle} color="muted-foreground" />
          <Text className="text-muted-foreground">{commentCount?.count ?? '—'}</Text>
        </Button>
        </View>
        {likeState?.error ? (
          <Text variant="muted" className="shrink text-right text-xs" accessibilityLiveRegion="polite">
            {likeState.error}
          </Text>
        ) : null}
      </View>
    </CardContent>
  </Card>;
}

export const PostCard = memo(PostCardComponent);
