import { useCallback, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { Search, WifiOff, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Profile } from '@/lib/database.types';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from './search-query';
import { StudentResultRow } from './student-result-row';
import type { StudentResult } from './student-search';
import { useStudentSearch } from './use-student-search';

const OPEN_PROFILE_INTERVAL = 800;
const keyExtractor = (item: StudentResult) => item.id;

function ResultsSkeleton() {
  return <View className="gap-4 pt-2" accessibilityLabel="Searching students" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="flex-row items-center gap-[10px]">
      <Skeleton className="size-10 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-[134px] rounded-full" />
        <Skeleton className="h-2.5 w-[90px] rounded-full" />
        <Skeleton className="h-2.5 w-[168px] rounded-full" />
      </View>
    </View>)}
  </View>;
}

function ItemSeparator() {
  return <View className="h-2" />;
}

// Figma "Discover": title bar, search field, then results. Sprint 5A searches
// students only; the search stays mounted under a pushed student profile, so the
// text, results and scroll position are still there on return.
export function DiscoverScreen({ profile }: { profile: Profile }) {
  const [query, setQuery] = useState('');
  const { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, retry } = useStudentSearch(query);
  const lastOpened = useRef(0);
  const typed = query.trim().length > 0;

  const openStudent = useCallback((studentId: string) => {
    Keyboard.dismiss();
    // Your own result leads to the Profile tab, as your own posts do on Home.
    if (studentId === profile.id) { router.navigate('/account'); return; }
    const now = Date.now();
    if (now - lastOpened.current < OPEN_PROFILE_INTERVAL) return;
    lastOpened.current = now;
    router.push({ pathname: '/students/[id]', params: { id: studentId } });
  }, [profile.id]);
  const clear = useCallback(() => setQuery(''), []);
  const renderStudent = useCallback<ListRenderItem<StudentResult>>(
    ({ item }) => <StudentResultRow student={item} onOpen={openStudent} />,
    [openStudent],
  );
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  const empty = status === 'loading' ? <ResultsSkeleton />
    : status === 'error' ? <StatePanel
      icon={WifiOff}
      title="Search couldn’t load"
      description="Check your connection and try again."
      live
      actionLabel="Try again"
      onAction={retry}
    /> : status === 'empty' ? <StatePanel
      icon={Search}
      title="No matches just yet"
      description="Try a different name or username. A broader search can help."
      live
      actionLabel="Clear search"
      onAction={clear}
    /> : <StatePanel
      icon={Search}
      title="Find fellow students"
      description={typed
        ? `Type at least ${SEARCH_MIN_LENGTH} letters or numbers to search.`
        : 'Search by name or username to find students on Penguin.'}
      live={typed}
    />;
  const header = status === 'ready' ? <Text variant="small" className="pb-2 text-muted-foreground" accessibilityLiveRegion="polite">
    {items.length}{hasMore ? '+' : ''} {items.length === 1 && !hasMore ? 'student' : 'students'}
  </Text> : null;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more students" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More students couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
  </View> : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Discover" />
    <View className="px-5 pb-3 pt-2">
      <Input
        variant="search"
        leadingIcon={Search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search your student community"
        accessibilityLabel="Search students by name or username"
        maxLength={SEARCH_MAX_LENGTH}
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={() => Keyboard.dismiss()}
        trailing={query ? <Pressable
          className="size-11 items-center justify-center active:opacity-70"
          role="button"
          hitSlop={2}
          accessibilityLabel="Clear search"
          onPress={clear}
        >
          <Icon as={X} color="muted-foreground" />
        </Pressable> : undefined}
      />
    </View>
    <FlatList
      className="flex-1"
      contentContainerClassName="px-5 pb-6"
      data={items}
      renderItem={renderStudent}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      ItemSeparatorComponent={ItemSeparator}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      accessibilityLabel="Student search results"
    />
  </SafeAreaView>;
}
