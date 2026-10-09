import { DiscoverScreen } from '@/features/discover/discover-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function Discover() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // Keyed by account, so another student never sees the previous search.
  return <DiscoverScreen key={state.profile.id} profile={state.profile} />;
}
