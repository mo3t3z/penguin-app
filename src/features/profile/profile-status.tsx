import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { signOut } from '@/features/auth/service';
import { useProfile } from './provider';

export function ProfileStatus() {
  const { state, refresh } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry(logout = false) {
    if (busy) return;
    setBusy(true); setError(null);
    try { if (logout) await signOut(); else await refresh(); }
    catch { setError('We could not connect. Please try again.'); }
    finally { setBusy(false); }
  }
  const loading = state.status === 'loading';
  return <SafeAreaView className="flex-1 bg-background"><View className="flex-1 justify-center gap-5 p-6">
    <Text variant="h2">{loading ? 'Getting your profile ready…' : state.status === 'missing' ? 'Your profile isn’t ready yet.' : 'Let’s reconnect.'}</Text>
    {loading ? <><Skeleton className="h-12 w-full" /><Skeleton className="h-24 w-full" /></> : <>
      <Text>{state.status === 'missing' ? 'We couldn’t find your student profile. Retry, or contact Penguin support if this continues.' : 'Check your connection, then try loading your profile again.'}</Text>
      <Button loading={busy} onPress={() => void retry()}><Text>Retry loading profile</Text></Button>
      <Button variant="ghost" disabled={busy} onPress={() => void retry(true)}><Text>Log out</Text></Button>
    </>}
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
  </View></SafeAreaView>;
}
