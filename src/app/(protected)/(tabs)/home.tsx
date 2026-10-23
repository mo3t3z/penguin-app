import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { NotificationsBell } from '@/features/notifications/notifications-bell';
import { FeedList } from '@/features/posts/feed-list';
import { ProfileStatus } from '@/features/profile/profile-status';
import { useProfile } from '@/features/profile/provider';
import type { Profile } from '@/lib/database.types';

const OPEN_PROFILE_INTERVAL = 800;

// Home is the wordmark and the feed, nothing else. Search and Messages are tabs and
// Create is in the navigation, so the header carries no buttons and the feed has no
// inline composer. Stories and the Following / My School tabs are not here because
// nothing backs them yet.
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
  // Pressing Home while already on Home returns the feed to its top, as people
  // expect from a feed. The tab bar emits `tabPress` for every press of a tab.
  const navigation = useNavigation();
  const [scrollToTop, setScrollToTop] = useState(0);
  useEffect(() => {
    const tabs = navigation as unknown as { addListener: (event: 'tabPress', listener: () => void) => () => void; isFocused: () => boolean };
    return tabs.addListener('tabPress', () => { if (tabs.isFocused()) setScrollToTop((value) => value + 1); });
  }, [navigation]);
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar actions={<NotificationsBell />} />
    <FeedList onOpenAuthor={openAuthor} underNavigation scrollToTopSignal={scrollToTop} />
  </SafeAreaView>;
}

export default function Home() {
  const { state } = useProfile();
  if (state.status !== 'ready') return <ProfileStatus />;
  return <HomeFeed key={state.profile.id} profile={state.profile} />;
}
