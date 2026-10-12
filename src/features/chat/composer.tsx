import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { layout, radius } from '@/theme/tokens';
import { canSendMessage, MESSAGE_TEXT_LIMIT } from './chat';

// The send button: a 48px circle with the beak at the bottom right.
const sendShape = {
  width: layout.touchMin, height: layout.touchMin,
  borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: radius.beak,
} as const;

// A pill-shaped text field and the send button. Text is the only thing a message
// can carry, so there is no attach, photo or voice control. The draft is cleared
// as soon as the message is handed over; a message that fails stays in the thread
// with Retry, so nothing typed is lost. The field grows with the text up to about
// five lines (5 x 24px line height + padding), then scrolls inside.
export function Composer({ placeholder, onSend, onDraftChange }: {
  placeholder: string;
  onSend: (content: string) => boolean;
  // Told whether the field holds text after each change (drives the typing signal).
  onDraftChange?: (hasText: boolean) => void;
}) {
  const [draft, setDraftText] = useState('');
  const setDraft = (value: string) => {
    setDraftText(value);
    onDraftChange?.(value.trim().length > 0);
  };
  const ready = canSendMessage(draft);
  const submit = () => {
    if (ready && onSend(draft)) setDraft('');
  };
  return <View className="flex-row items-end gap-2">
    <Input
      multiline
      className="max-h-36 w-auto flex-1 rounded-xl px-4"
      value={draft}
      onChangeText={(value) => { if ([...value].length <= MESSAGE_TEXT_LIMIT) setDraft(value); }}
      placeholder={placeholder}
      accessibilityLabel="Message"
    />
    <Pressable
      className={cn('items-center justify-center', ready ? 'bg-primary active:bg-primary-pressed' : 'bg-muted')}
      style={sendShape}
      role="button"
      accessibilityLabel="Send message"
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={submit}
    >
      <Icon as={Send} size={24} color={ready ? 'primary-foreground' : 'disabled-foreground'} />
    </Pressable>
  </View>;
}
