import { useLocalSearchParams } from 'expo-router';
import { GroupBansScreen } from '@/features/groups/group-bans-screen';
import { isGroupUuid } from '@/features/groups/groups';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';

export default function GroupBansRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  // The id comes from navigation, so it is checked before it reaches a query.
  const groupId = isGroupUuid(params.id) ? params.id.toLowerCase() : null;
  return <GroupBansScreen key={`${state.profile.id}:${groupId}`} groupId={groupId} />;
}
