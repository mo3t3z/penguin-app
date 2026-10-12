import { ConversationsScreen } from '@/features/chat/conversations-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function Messages() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // Keyed by account, so another student never sees the previous list.
  return <ConversationsScreen key={state.profile.id} userId={state.profile.id} />;
}
