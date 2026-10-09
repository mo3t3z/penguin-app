import { memo } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { messageTimeLabel, type ChatMessage } from './chat';

// Figma "Chat": incoming messages on a card-coloured bubble at the left, your own
// on a tinted bubble at the right, each with its time. `dayLabel` is set for the
// first message of a day and is shown centred above it.
function MessageBubbleComponent({ message, mine, dayLabel, onRetry }: {
  message: ChatMessage;
  mine: boolean;
  dayLabel: string | null;
  onRetry: (messageId: string) => void;
}) {
  const pending = message.delivery === 'pending';
  const failed = message.delivery === 'failed';
  const status = pending ? 'Sending…' : failed ? 'Not sent' : messageTimeLabel(message.created_at);
  return <View className="gap-2 py-1.5">
    {dayLabel ? <Text variant="caption" className="py-1 text-center text-muted-foreground" accessibilityRole="header">
      {dayLabel}
    </Text> : null}
    <View
      className={cn('max-w-[82%] gap-1 rounded-lg px-[14px] py-[10px]',
        mine ? 'self-end bg-accent' : 'self-start bg-card', pending && 'opacity-70')}
      accessible
      accessibilityLabel={`${mine ? 'You' : 'They'} wrote: ${message.content}. ${status}`}
      accessibilityState={{ busy: pending }}
    >
      <Text selectable>{message.content}</Text>
      <Text className={cn('text-right text-micro', failed ? 'text-destructive' : 'text-muted-foreground')}>{status}</Text>
    </View>
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
