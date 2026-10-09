import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { LogOut, Pencil } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useProfile } from '@/features/profile/provider';
import { ProfileScreen } from '@/features/profile/profile-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
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
  // Figma pairs "Edit Profile" with "Settings"; there is no settings screen yet, so
  // the second button is Log out.
  const actions = <View className="flex-row gap-[10px]">
    <Link href="/edit-profile" asChild>
      <Button className="flex-1" disabled={busy}>
        <Icon as={Pencil} size={18} color={busy ? 'muted-foreground' : 'primary-foreground'} />
        <Text>Edit Profile</Text>
      </Button>
    </Link>
    <Button variant="secondary" className="flex-1" loading={busy} onPress={() => void logout()}>
      {busy ? null : <Icon as={LogOut} size={18} color="primary" />}
      <Text>Log out</Text>
    </Button>
  </View>;
  return <ProfileScreen
    profile={profile}
    own
    actions={actions}
    notice={error ? <Text className="px-1 text-destructive" accessibilityLiveRegion="polite">{error}</Text> : undefined}
    studies={{
      loading: references.loading, failed: references.failed, retry: references.retry,
      institution: references.data?.institution ?? null, field: references.data?.field ?? null,
    }}
  />;
}

export default function Account() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <OwnProfile key={state.profile.id} profile={state.profile} />;
}
