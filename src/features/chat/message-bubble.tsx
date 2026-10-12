import { memo } from 'react';
import { View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { isRightToLeft, messageTimeLabel, type ChatMessage, type MessageGroupPosition } from './chat';
import type { MessageReceipt } from './realtime';

const receiptLabels: Record<MessageReceipt, string> = { sent: 'Sent', read: 'Read' };
const rightToLeft = { textAlign: 'right', writingDirection: 'rtl' } as const;

// One message in a conversation.
//
// Your own messages sit on an orange bubble at the right with no avatar; text on
// orange is `primary-foreground`, which keeps it readable. The other student's sit
// on a muted bubble at the left, next to their avatar.
//
// Consecutive messages from one sender form a group (`group`): they sit 2px apart
// (16px between groups), the avatar appears once, beside the last of them, and only
// that last message shows its time. The last bubble of a group also carries the
// beak: one tight corner pointing at the sender. Earlier bubbles keep the same
// indent so they line up. `dayLabel` is set for the first message of a day and is
// shown centred above it. `receipt` is set on your newest stored message only:
// "Sent" once the server has it, "Read" once the server reports it read. There is
// no "delivered" state because nothing reports it.
function MessageBubbleComponent({ message, mine, dayLabel, receipt, group, sender, onRetry }: {
  message: ChatMessage;
  mine: boolean;
  dayLabel: string | null;
  receipt: MessageReceipt | null;
  group: MessageGroupPosition;
  // Who wrote an incoming message, for the avatar.
  sender: { name: string; avatarUrl: string | null };
  onRetry: (messageId: string) => void;
}) {
  const pending = message.delivery === 'pending';
  const failed = message.delivery === 'failed';
  const time = messageTimeLabel(message.created_at);
  const status = pending ? 'Sending…' : failed ? 'Not sent' : receipt ? `${time} · ${receiptLabels[receipt]}` : time;
  // Within a group only the last message shows its time; anything unsent always says so.
  const showStatus = group.end || pending || failed || receipt !== null;
  const arabic = isRightToLeft(message.content);
  const direction = arabic ? rightToLeft : undefined;
  const label = `${mine ? 'You' : sender.name} wrote: ${message.content}. ${status}`;

  return <View className={group.start ? 'pt-4' : 'pt-0.5'}>
    {dayLabel ? <Text variant="caption" className="pb-4 pt-2 text-center text-muted-foreground" accessibilityRole="header">
      {dayLabel}
    </Text> : null}
    {mine ? <View className="items-end">
      <View
        className={cn('max-w-[82%] rounded-lg bg-primary px-3.5 py-2.5', group.end && 'rounded-br-beak', pending && 'opacity-70')}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ busy: pending }}
      >
        <Text selectable className={cn('text-primary-foreground', arabic && 'text-body-ar')} style={direction}>{message.content}</Text>
      </View>
      {showStatus ? <Text
        className={cn('px-1 pt-1 text-caption', failed ? 'font-inter-semibold text-destructive' : 'text-muted-foreground')}
        aria-hidden
      >{status}</Text> : null}
    </View> : <View className="flex-row items-end gap-2">
      {/* The avatar column is always there, so grouped bubbles share one left edge.
          It sits beside the bubble, above the time line. */}
      <View className={cn('w-7', showStatus && 'pb-5')}>
        {group.end ? <UserAvatar name={sender.name} uri={sender.avatarUrl} size="sm" /> : null}
      </View>
      <View className="min-w-0 flex-1 items-start">
        <View
          className={cn('max-w-[82%] rounded-lg bg-muted px-3.5 py-2.5', group.end && 'rounded-bl-beak')}
          accessible
          accessibilityLabel={label}
        >
          <Text selectable className={cn('text-foreground', arabic && 'text-body-ar')} style={direction}>{message.content}</Text>
        </View>
        {showStatus ? <Text className="px-1 pt-1 text-caption text-muted-foreground" aria-hidden>{time}</Text> : null}
      </View>
    </View>}
    {failed ? <Button
      variant="ghost"
      size="sm"
      className="self-end"
      accessibilityLabel="Retry sending this message"
      onPress={() => onRetry(message.id)}
    >
      <Text>Retry</Text>
    </Button> : null}
  </View>;
}

export const MessageBubble = memo(MessageBubbleComponent);
