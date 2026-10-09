import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/profile/provider';
import { ProfileStatus } from '@/features/profile/profile-status';
import { ProfileIdentity, ProfileStudies } from '@/features/profile/presentation';
import { useProfileReferences } from '@/features/profile/use-references';
import type { Profile } from '@/lib/database.types';
import { authErrorMessage, signOut } from '@/features/auth/service';

function OwnProfile({ profile }: { profile: Profile }) {
  const references = useProfileReferences(profile.id, profile.institution_id, profile.field_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await signOut(); }
    catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="My profile" />
    <ScrollView contentContainerClassName="gap-5 px-5 pb-6 pt-4">
      <ProfileIdentity profile={profile} ownProfile />
      {references.loading ? <View className="gap-3"><Text variant="muted">Loading your studies…</Text><Skeleton className="h-40 w-full" /></View>
        : references.failed ? <View className="gap-3"><Text>We couldn’t load your institution and field. Check your connection and retry.</Text>
          <Button variant="outline" onPress={references.retry}><Text>Retry study details</Text></Button></View>
          : <ProfileStudies institution={references.data?.institution ?? null} field={references.data?.field ?? null} level={profile.study_level} />}
      <Link href="/edit-profile" asChild><Button disabled={busy}><Text>Edit Profile</Text></Button></Link>
      {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
      <Button variant="ghost" loading={busy} onPress={() => void logout()}><Text>Log out</Text></Button>
    </ScrollView>
  </SafeAreaView>;
}

export default function Account() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <OwnProfile key={state.profile.id} profile={state.profile} />;
}
