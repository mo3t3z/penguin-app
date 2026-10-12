import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { relativePublicationTime } from '@/features/posts/post-presentation';
import { cn } from '@/lib/utils';
import { conversationPreview, otherParticipant, type ConversationSummary } from './chat';

// Inbox row: 72px high, 48px avatar, name over the last message, time at the right
// with an orange dot beneath it when the conversation is unread. The divider runs
// under the text, not the avatar. Unread is a yes or no (dot, bold name and the
// word "Unread" for screen readers), never a count. A student who deleted their
// account appears only as "Deleted Student".
function ConversationRowComponent({ conversation, userId, unread, onOpen }: {
  conversation: ConversationSummary;
  userId: string;
  unread: boolean;
  onOpen: (conversationId: string) => void;
}) {
  const other = otherParticipant(conversation, userId);
  const preview = conversationPreview(conversation, userId);
  const time = conversation.last_message_at ? relativePublicationTime(conversation.last_message_at) : '';
  return <Pressable
    className="min-h-18 flex-row items-center gap-3 px-5 active:bg-muted"
    role="button"
    accessibilityLabel={`Conversation with ${other.name}. ${unread ? 'Unread. ' : ''}${preview || 'No messages yet'}${time ? `. ${time}` : ''}`}
    onPress={() => onOpen(conversation.id)}
  >
    <UserAvatar name={other.name} uri={other.avatarUrl} size="lg" />
    <View className="min-h-18 min-w-0 flex-1 flex-row items-center gap-3 border-b border-divider py-3">
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={unread ? 'font-inter-bold' : 'font-inter-semibold'}>{other.name}</Text>
        <Text numberOfLines={1} className={cn('text-callout', unread ? 'font-inter-medium text-foreground' : 'text-muted-foreground')}>
          {preview}
        </Text>
      </View>
      <View className="items-end gap-1.5">
        {time ? <Text className={cn('text-caption', unread ? 'font-inter-semibold text-primary-text' : 'text-muted-foreground')}>{time}</Text> : null}
        <View className={cn('size-2.5 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
      </View>
    </View>
  </Pressable>;
}

export const ConversationRow = memo(ConversationRowComponent);
