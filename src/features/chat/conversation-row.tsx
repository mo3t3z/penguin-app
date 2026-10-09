import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { relativePublicationTime } from '@/features/posts/post-presentation';
import { conversationPreview, otherParticipant, type ConversationSummary } from './chat';

// Figma "Messages" row: 48px avatar, name over the last message, time at the right.
// A student who deleted their account appears only as "Deleted Student".
function ConversationRowComponent({ conversation, userId, onOpen }: {
  conversation: ConversationSummary;
  userId: string;
  onOpen: (conversationId: string) => void;
}) {
  const other = otherParticipant(conversation, userId);
  const preview = conversationPreview(conversation, userId);
  const time = conversation.last_message_at ? relativePublicationTime(conversation.last_message_at) : '';
  return <Pressable
    className="min-h-[72px] flex-row items-center gap-3 border-b border-border py-3 active:opacity-70"
    role="button"
    accessibilityLabel={`Conversation with ${other.name}. ${preview || 'No messages yet'}${time ? `. ${time}` : ''}`}
    onPress={() => onOpen(conversation.id)}
  >
    <UserAvatar name={other.name} uri={other.avatarUrl} size="lg" />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text variant="large" numberOfLines={1} className="min-w-0 flex-1">{other.name}</Text>
        {time ? <Text className="text-micro text-muted-foreground">{time}</Text> : null}
      </View>
      <Text variant="muted" numberOfLines={1}>{preview}</Text>
    </View>
  </Pressable>;
}

export const ConversationRow = memo(ConversationRowComponent);
