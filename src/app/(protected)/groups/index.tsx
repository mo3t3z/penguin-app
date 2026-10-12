import { GroupsScreen } from '@/features/groups/groups-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function Groups() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // Keyed by account, so another student never sees the previous search or lists.
  return <GroupsScreen key={state.profile.id} />;
}
