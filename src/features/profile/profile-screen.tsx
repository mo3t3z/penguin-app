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

// One layout for your own profile and another student's: the header, the centred
// identity block, the Posts / About tabs, and that student's posts. Your own
// profile shows @username and one header action (More options) and sits under the
// navigation; another student's is a pushed screen with Back only. `actions` is the
// identity block's primary button.
export function ProfileScreen({ profile, studies, own, onBack, actions, headerAction, notice }: {
  profile: PublicProfile;
  studies: ProfileStudyDetails;
  own: boolean;
  onBack?: () => void;
  actions?: ReactNode;
  headerAction?: ReactNode;
  notice?: ReactNode;
}) {
  const [tab, setTab] = useState<ProfileTab>('posts');
  const firstName = profileDisplayName(profile.display_name).split(/\s+/)[0];
  const header = <View>
    {notice}
    <ProfileHeader profile={profile} studies={studies} own={own} actions={actions} />
    <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
  </View>;
  const noPosts = own
    ? <StatePanel icon={NotebookPen} title="A fresh page"
      description="Your thoughts, questions, and discoveries belong here. Share your first post."
      actionLabel="Create a post" onAction={() => router.push('/create-post')} />
    : <StatePanel icon={NotebookPen} title="No posts yet" description={`${firstName} hasn’t shared anything yet.`} />;
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar
      title={own && profile.username ? `@${profile.username}` : undefined}
      brand={false}
      onBack={onBack}
      actions={headerAction}
    />
    <FeedList
      key={profile.id}
      authorId={profile.id}
      header={header}
      emptyState={noPosts}
      replacement={tab === 'about' ? <ProfileAbout profile={profile} studies={studies} /> : undefined}
      underNavigation={own}
    />
  </SafeAreaView>;
}
