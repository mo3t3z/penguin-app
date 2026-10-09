import { useState } from 'react';
import { View } from 'react-native';
import { Send } from 'lucide-react-native';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { canSendMessage, MESSAGE_TEXT_LIMIT } from './chat';

// Figma "Chat" composer: a text field and a tinted send button. The draft is
// cleared as soon as the message is handed over; a message that fails stays in
// the thread with Retry, so nothing typed is lost.
export function Composer({ placeholder, onSend }: {
  placeholder: string;
  onSend: (content: string) => boolean;
}) {
  const [draft, setDraft] = useState('');
  const ready = canSendMessage(draft);
  const submit = () => {
    if (ready && onSend(draft)) setDraft('');
  };
  return <View className="flex-row items-end gap-2">
    <Input
      multiline
      className="max-h-32 min-h-[52px] w-auto flex-1"
      value={draft}
      onChangeText={(value) => { if ([...value].length <= MESSAGE_TEXT_LIMIT) setDraft(value); }}
      placeholder={placeholder}
      accessibilityLabel="Message"
    />
    <IconButton
      icon={Send}
      color="primary"
      className="mb-1 bg-accent"
      accessibilityLabel="Send message"
      disabled={!ready}
      onPress={submit}
    />
  </View>;
}
