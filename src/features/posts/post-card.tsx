import { memo } from 'react';
import { View } from 'react-native';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { FeedPost } from './feed';
import { PostMediaGrid } from './post-media-grid';
import { publicationAccessibilityLabel, relativePublicationTime } from './post-presentation';

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

function PostCardComponent({ post, visible }: { post: FeedPost; visible: boolean }) {
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
    </CardContent>
  </Card>;
}

export const PostCard = memo(PostCardComponent);
