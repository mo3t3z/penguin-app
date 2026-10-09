import { router, useLocalSearchParams } from 'expo-router';
import { UserRoundX, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { useAuth } from '@/features/auth/provider';
import { ProfileScreen } from '@/features/profile/profile-screen';
import { ProfileSkeleton } from '@/features/profile/profile-skeleton';
import type { PublicProfile } from '@/features/profile/service';
import { useProfileReferences } from '@/features/profile/use-references';
import { useStudentProfile } from '@/features/profile/use-student-profile';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function StudentProfile({ profile, viewerId }: { profile: PublicProfile; viewerId: string }) {
  const references = useProfileReferences(viewerId, profile.institution_id, profile.field_id);
  // Read-only: no edit or account actions are offered here, even for your own id.
  return <ProfileScreen
    profile={profile}
    own={false}
    onBack={goBack}
    studies={{
      loading: references.loading, failed: references.failed, retry: references.retry,
      institution: references.data?.institution ?? null, field: references.data?.field ?? null,
    }}
  />;
}

export default function StudentProfileRoute() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  // The id comes from navigation, so it is checked before it reaches a query.
  const profileId = typeof params.id === 'string' && uuidPattern.test(params.id) ? params.id.toLowerCase() : null;
  const { state, retry } = useStudentProfile(profileId);
  if (state.status === 'ready' && viewerId) {
    return <StudentProfile key={`${viewerId}:${state.profile.id}`} profile={state.profile} viewerId={viewerId} />;
  }
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Student profile" onBack={goBack} />
    {state.status === 'failed' ? <StatePanel icon={WifiOff} title="Profile couldn’t load"
      description="Check your connection and try again." live actionLabel="Try again" onAction={retry} />
      : state.status === 'missing' ? <StatePanel icon={UserRoundX} title="Profile not found"
        description="This student profile isn’t available." actionLabel="Go back" onAction={goBack} />
        : <ProfileSkeleton message="Getting to know your fellow student…" />}
  </SafeAreaView>;
}
