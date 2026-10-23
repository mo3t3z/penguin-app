import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { LogOut, Menu as MenuIcon, Pencil } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Menu } from '@/components/ui/menu';
import { Text } from '@/components/ui/text';
import { useProfile } from '@/features/profile/provider';
import { ProfileScreen } from '@/features/profile/profile-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfileReferences } from '@/features/profile/use-references';
import type { Profile } from '@/lib/database.types';
import { authErrorMessage, signOut } from '@/features/auth/service';
import { layout } from '@/theme/tokens';

function OwnProfile({ profile }: { profile: Profile }) {
  const references = useProfileReferences(profile.id, profile.institution_id, profile.field_id);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await signOut(); }
    catch (cause) { setError(authErrorMessage(cause)); setMenuOpen(false); }
    finally { inFlight.current = false; setBusy(false); }
  }
  // Edit profile is the one primary action. Log out is rare and risky, so it lives
  // in the More options menu; choosing it signs out directly, with the busy state
  // on the menu item and any error announced under the header.
  return <>
    <ProfileScreen
      profile={profile}
      own
      actions={<Link href="/edit-profile" asChild>
        <Button variant="outline" size="sm" disabled={busy}><Icon as={Pencil} size={16} /><Text>Edit profile</Text></Button>
      </Link>}
      headerAction={<IconButton icon={MenuIcon} accessibilityLabel="More options" tinted={menuOpen} onPress={() => setMenuOpen(true)} />}
      notice={error ? <Text variant="callout" className="px-5 pb-2 text-destructive" accessibilityLiveRegion="polite">{error}</Text> : undefined}
      studies={{
        loading: references.loading, failed: references.failed, retry: references.retry,
        institution: references.data?.institution ?? null, field: references.data?.field ?? null,
      }}
    />
    <Menu
      visible={menuOpen}
      top={insets.top + layout.header - 4}
      right={8 + insets.right}
      onClose={() => { if (!busy) setMenuOpen(false); }}
      items={[{ key: 'log-out', label: 'Log out', icon: LogOut, destructive: true, busy, onPress: () => void logout() }]}
    />
  </>;
}

export default function Account() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <OwnProfile key={state.profile.id} profile={state.profile} />;
}
