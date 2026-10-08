import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';
import { CreatePostScreen } from '@/features/posts/create-screen';

export default function CreatePost() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <CreatePostScreen key={state.profile.id} profile={state.profile} />;
}
