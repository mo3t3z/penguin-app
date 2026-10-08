import { useProfile } from '@/features/profile/provider';
import { ProfileStatus } from '@/features/profile/profile-status';
import { EditProfileScreen } from '@/features/profile/edit-screen';

export default function EditProfile() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <EditProfileScreen key={state.profile.id} profile={state.profile} />;
}
