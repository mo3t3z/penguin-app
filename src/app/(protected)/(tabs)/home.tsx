import { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Link, router } from 'expo-router';
import { SquarePen } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { UserAvatar } from '@/components/social/user-avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { FeedList } from '@/features/posts/feed-list';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';
import type { Profile } from '@/lib/database.types';

const OPEN_PROFILE_INTERVAL = 800;

function greeting(hour = new Date().getHours()) {
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

// Figma "Feed introduction": a greeting and the quick composer that opens Create post.
function FeedIntroduction({ profile }: { profile: Profile }) {
  const name = profile.display_name?.trim() || 'Penguin student';
  const firstName = name.split(/\s+/)[0];
  return <View className="gap-3 pt-4">
    <Text variant="caption" className="text-muted-foreground">{greeting()}, {firstName}. What’s on your mind?</Text>
    <Link href="/create-post" asChild>
      <Pressable
        className="min-h-12 flex-row items-center gap-[10px] rounded-md bg-muted p-3 active:bg-accent"
        role="button"
        accessibilityLabel="Create a post"
      >
        <UserAvatar name={name} uri={profile.avatar_url} size="composer" />
        <Text variant="muted" numberOfLines={1} className="flex-1">Share a thought or ask a question</Text>
        <Icon as={SquarePen} color="primary" />
      </Pressable>
    </Link>
  </View>;
}

function HomeFeed({ profile }: { profile: Profile }) {
  const lastOpened = useRef(0);
  // Your own posts lead to the Profile tab; another student's open a profile
  // screen above the tabs, so Home stays mounted underneath.
  const openAuthor = useCallback((authorId: string) => {
    if (authorId === profile.id) { router.navigate('/account'); return; }
    const now = Date.now();
    if (now - lastOpened.current < OPEN_PROFILE_INTERVAL) return;
    lastOpened.current = now;
    router.push({ pathname: '/students/[id]', params: { id: authorId } });
  }, [profile.id]);
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar />
    <FeedList header={<FeedIntroduction profile={profile} />} onOpenAuthor={openAuthor} />
  </SafeAreaView>;
}

export default function Home() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <HomeFeed key={state.profile.id} profile={state.profile} />;
}
