import { useLocalSearchParams } from 'expo-router';
import { isChatUuid } from '@/features/chat/chat';
import { ChatScreen } from '@/features/chat/chat-screen';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function Conversation() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // The id comes from navigation, so it is checked before it reaches a query.
  const conversationId = isChatUuid(params.conversationId) ? params.conversationId.toLowerCase() : null;
  return <ChatScreen key={`${state.profile.id}:${conversationId}`} conversationId={conversationId} />;
}
