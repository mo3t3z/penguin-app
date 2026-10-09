import { memo } from 'react';
import { View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { publicationAccessibilityLabel, relativePublicationTime } from '@/features/posts/post-presentation';
import type { CommentListItem } from './comments';

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

function CommentItemComponent({ comment, ownComment, onDelete }: {
  comment: CommentListItem;
  ownComment: boolean;
  onDelete: (commentId: string) => void;
}) {
  const name = comment.author?.display_name?.trim() || 'Penguin student';
  const username = comment.author?.username?.trim() || 'student';
  const avatar = comment.author?.avatar_url?.trim() || null;
  const deleting = Boolean(comment.deleting);
  return <View
    className="flex-row gap-3 border-b border-border py-4"
    accessibilityState={{ busy: Boolean(comment.optimistic || deleting) }}
  >
    <Avatar key={avatar ?? 'initials'} alt={`${name}'s avatar`} size="md">
      {avatar ? <AvatarImage source={{ uri: avatar }} /> : null}
      <AvatarFallback className="bg-secondary">
        <Text className="font-inter-semibold text-accent-foreground">{initialsFor(name)}</Text>
      </AvatarFallback>
    </Avatar>
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="large" numberOfLines={1} className="shrink">{name}</Text>
        <Text variant="muted" numberOfLines={1} className="shrink">@{username}</Text>
      </View>
      <Text selectable>{comment.content}</Text>
      <View className="min-h-10 flex-row items-center justify-between">
        <Text variant="muted" accessibilityLabel={publicationAccessibilityLabel(comment.created_at)}>
          {comment.optimistic ? 'Sending…' : relativePublicationTime(comment.created_at)}
        </Text>
        {ownComment && !comment.optimistic ? <Button
          variant="ghost"
          size="sm"
          loading={deleting}
          disabled={deleting}
          accessibilityLabel={deleting ? 'Deleting comment' : 'Delete comment'}
          onPress={() => {
            if (!deleting) onDelete(comment.id);
          }}
        >
          <Icon as={Trash2} size={16} color="destructive" />
          <Text className="text-destructive">Delete</Text>
        </Button> : null}
      </View>
    </View>
  </View>;
}

export const CommentItem = memo(CommentItemComponent);
