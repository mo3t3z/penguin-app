import { useLocalSearchParams } from 'expo-router';
import { NewMessageScreen } from '@/features/chat/new-message-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function NewMessage() {
  const params = useLocalSearchParams<{ focus?: string | string[] }>();
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // Keyed by account, so another student never sees the previous search.
  return <NewMessageScreen key={state.profile.id} userId={state.profile.id} focusSearch={params.focus === 'search'} />;
}
