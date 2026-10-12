import { CreateGroupScreen } from '@/features/groups/create-group-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function NewGroup() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // Keyed by account, so another student never sees the previous draft.
  return <CreateGroupScreen key={state.profile.id} />;
}
