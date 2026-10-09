import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { NotebookPen } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SegmentedTabs } from '@/components/navigation/segmented-tabs';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { FeedList } from '@/features/posts/feed-list';
import { ProfileAbout } from './profile-about';
import { profileDisplayName } from './profile-format';
import { ProfileHeader, type ProfileStudyDetails } from './profile-header';
import type { PublicProfile } from './service';

const tabs = [{ key: 'posts', label: 'Posts' }, { key: 'about', label: 'About' }] as const;
type ProfileTab = typeof tabs[number]['key'];

// One layout for "My profile" and "Student profile": the identity header, the
// Posts / About tabs, and that student's posts. Only the owner gets `actions`
// (edit, log out) and the "Create a post" empty state.
export function ProfileScreen({ profile, studies, own, onBack, actions, notice }: {
  profile: PublicProfile;
  studies: ProfileStudyDetails;
  own: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  notice?: ReactNode;
}) {
  const [tab, setTab] = useState<ProfileTab>('posts');
  const firstName = profileDisplayName(profile.display_name).split(/\s+/)[0];
  const header = <View className="gap-5">
    <ProfileHeader profile={profile} studies={studies} own={own} actions={actions} />
    {notice}
    <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
  </View>;
  const noPosts = own
    ? <StatePanel icon={NotebookPen} title="A fresh page"
      description="Your thoughts, questions, and discoveries belong here. Share your first post."
      actionLabel="Create a post" onAction={() => router.push('/create-post')} />
    : <StatePanel icon={NotebookPen} title="No posts yet" description={`${firstName} hasn’t shared anything yet.`} />;
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title={own ? 'My profile' : 'Student profile'} onBack={onBack} />
    <FeedList
      key={profile.id}
      authorId={profile.id}
      header={header}
      emptyState={noPosts}
      replacement={tab === 'about' ? <ProfileAbout profile={profile} studies={studies} /> : undefined}
    />
  </SafeAreaView>;
}
