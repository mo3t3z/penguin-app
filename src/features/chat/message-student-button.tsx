import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { chatErrorKind, type ChatErrorKind } from './chat';
import { getOrCreateConversation } from './service';

const openErrors: Record<ChatErrorKind, string> = {
  unavailable: 'You can’t message this student right now.',
  'rate-limited': 'You’ve started a lot of conversations today. Try again tomorrow.',
  invalid: 'You can’t message this student right now.',
  forbidden: 'You can’t message this student right now.',
  network: 'Penguin couldn’t open that conversation. Check your connection and try again.',
};

// Figma "Student profile" Message button. The database finds or creates the
// conversation; a second tap while that is in progress does nothing.
export function MessageStudentButton({ studentId }: { studentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function open() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const conversationId = await getOrCreateConversation(studentId);
      router.push({ pathname: '/messages/[conversationId]', params: { conversationId } });
    } catch (cause) {
      setError(openErrors[chatErrorKind(cause)]);
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }
  return <View className="gap-2">
    <Button variant="secondary" loading={busy} accessibilityLabel="Message this student" onPress={() => void open()}>
      {busy ? null : <Icon as={MessageCircle} size={18} color="primary" />}
      <Text>Message</Text>
    </Button>
    {error ? <Text variant="caption" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
  </View>;
}
