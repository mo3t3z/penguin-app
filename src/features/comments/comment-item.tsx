import { memo } from 'react';
import { View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { publicationAccessibilityLabel, relativePublicationTime } from '@/features/posts/post-presentation';
import type { CommentListItem } from './comments';

// One comment under a post: 40px avatar, name over "@username · time", then the
// text, with a divider below. Your own comments get a compact Delete.
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
    className="flex-row gap-3 border-b border-divider px-5 py-4"
    accessibilityState={{ busy: Boolean(comment.optimistic || deleting) }}
  >
    <UserAvatar name={name} uri={avatar} size="md" />
    <View className="min-w-0 flex-1 gap-1">
      <View>
        <Text variant="large" numberOfLines={1}>{name}</Text>
        <Text variant="muted" numberOfLines={1}>
          @{username} · <Text variant="muted" accessibilityLabel={comment.optimistic ? 'Sending' : publicationAccessibilityLabel(comment.created_at)}>
            {comment.optimistic ? 'Sending…' : relativePublicationTime(comment.created_at)}
          </Text>
        </Text>
      </View>
      <Text selectable>{comment.content}</Text>
      {ownComment && !comment.optimistic ? <Button
        variant="destructive"
        size="sm"
        className="-ml-3 self-start px-3"
        loading={deleting}
        disabled={deleting}
        accessibilityLabel={deleting ? 'Deleting comment' : 'Delete comment'}
        onPress={() => {
          if (!deleting) onDelete(comment.id);
        }}
      >
        <Text>Delete</Text>
      </Button> : null}
    </View>
  </View>;
}

export const CommentItem = memo(CommentItemComponent);
