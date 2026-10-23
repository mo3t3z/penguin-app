import { useState } from 'react';
import { View } from 'react-native';
import { Check, Clock, UserPlus, X } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useConnection } from './use-connection';

// Connect with another student. A request waits until they accept; a declined one
// can be sent again. Accepting is offered right here when they asked first.
export function ConnectionButton({ viewerId, studentId }: { viewerId: string; studentId: string }) {
  const { state, failed, busy, error, retry, connect, accept, decline, remove } = useConnection(viewerId, studentId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  let body;
  if (failed) body = <Button variant="outline" size="sm" onPress={retry}><Text>Retry</Text></Button>;
  else if (state === null) body = <Button variant="outline" size="sm" disabled loading><Text>Connect</Text></Button>;
  else if (state === 'incoming') body = <View className="flex-row gap-2">
    <Button size="sm" loading={busy} accessibilityLabel="Accept connection request" onPress={() => void accept()}>
      {busy ? null : <Icon as={Check} size={16} color="background" />}<Text>Accept</Text>
    </Button>
    <Button variant="outline" size="sm" disabled={busy} accessibilityLabel="Decline connection request" onPress={() => void decline()}>
      <Icon as={X} size={16} /><Text>Decline</Text>
    </Button>
  </View>;
  else if (state === 'outgoing') body = <Button variant="outline" size="sm" loading={busy}
    accessibilityLabel="Request sent. Cancel request" onPress={() => void remove()}>
    {busy ? null : <Icon as={Clock} size={16} />}<Text>Requested</Text>
  </Button>;
  else if (state === 'connected') body = <Button variant="outline" size="sm" loading={busy}
    accessibilityLabel="Connected. Remove connection" onPress={() => setConfirmRemove(true)}>
    {busy ? null : <Icon as={Check} size={16} color="primary-text" />}<Text>Connected</Text>
  </Button>;
  else body = <Button size="sm" loading={busy} onPress={() => void connect()}>
    {busy ? null : <Icon as={UserPlus} size={16} color="background" />}<Text>Connect</Text>
  </Button>;
  return <View className="items-end gap-1">
    {body}
    {error ? <Text variant="caption" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Dialog
      visible={confirmRemove}
      title="Remove this connection?"
      description="You can send a new request later."
      onClose={() => setConfirmRemove(false)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setConfirmRemove(false)}><Text>Keep</Text></Button>
        <Button variant="destructive" size="sm" onPress={() => { setConfirmRemove(false); void remove(); }}><Text>Remove</Text></Button>
      </>}
    />
  </View>;
}
