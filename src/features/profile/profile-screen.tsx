import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { FileText, Heart, Image as ImageIcon, NotebookPen } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SegmentedTabs } from '@/components/navigation/segmented-tabs';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { FeedList } from '@/features/posts/feed-list';
import { profileDisplayName } from './profile-format';
import { ProfileHeader, type ProfileStudyDetails } from './profile-header';
import { ProfileMediaGrid } from './profile-media-grid';
import type { PublicProfile } from './service';

const allTabs = [
  { key: 'posts', label: 'Posts', icon: FileText },
  { key: 'media', label: 'Media', icon: ImageIcon },
  { key: 'liked', label: 'Liked', icon: Heart },
] as const;
type ProfileTab = typeof allTabs[number]['key'];

// One layout for your own profile and another student's: the header, then Posts,
// Media and (on your own profile only, since likes are private) Liked. Your own
// profile shows the wordmark with its header actions and sits under the
// navigation; another student's is a pushed screen with Back. `actions` is the
// header's right-hand action.
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
  const tabs = useMemo(() => own ? allTabs : allTabs.filter(item => item.key !== 'liked'), [own]);
  const firstName = profileDisplayName(profile.display_name).split(/\s+/)[0];
  const header = <View>
    {notice}
    <ProfileHeader profile={profile} studies={studies} own={own} actions={actions} />
    <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
  </View>;
  const noPosts = tab === 'liked'
    ? <StatePanel icon={Heart} title="No liked posts yet" description="Posts you like appear here. Only you can see them." />
    : own
      ? <StatePanel icon={NotebookPen} title="A fresh page"
        description="Your thoughts, questions, and discoveries belong here. Share your first post."
        actionLabel="Create a post" onAction={() => router.push('/create-post')} />
      : <StatePanel icon={NotebookPen} title="No posts yet" description={`${firstName} hasn’t shared anything yet.`} />;
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar brand={own} onBack={onBack} actions={headerAction} />
    <FeedList
      key={`${profile.id}:${tab === 'liked' ? 'liked' : 'posts'}`}
      authorId={tab === 'liked' ? null : profile.id}
      likedOnly={tab === 'liked'}
      header={header}
      emptyState={noPosts}
      replacement={tab === 'media' ? <ProfileMediaGrid authorId={profile.id} own={own} /> : undefined}
      underNavigation={own}
    />
  </SafeAreaView>;
}
