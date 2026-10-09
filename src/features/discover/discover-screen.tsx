import { useCallback, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { Search, WifiOff, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SegmentedTabs } from '@/components/navigation/segmented-tabs';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FeedList, FeedSkeleton } from '@/features/posts/feed-list';
import type { Profile } from '@/lib/database.types';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
import { discoverScopes, postsPaneState, type DiscoverScope } from './discover-scopes';
import { SEARCH_DEBOUNCE_MS, SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, searchKey } from './search-query';
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

// Shown before there is anything to search for.
function Invitation({ title, typed, description }: { title: string; typed: boolean; description: string }) {
  return <StatePanel
    icon={Search}
    title={title}
    description={typed ? `Type at least ${SEARCH_MIN_LENGTH} letters or numbers to search.` : description}
    live={typed}
  />;
}

// Figma "Discover": title bar, search field, the Students / Posts tabs, then
// results. Both result panes stay mounted once they exist; the one that is not
// showing is hidden and paused, so its results and scroll position are still there
// when you switch back. The screen itself stays mounted under a pushed profile or
// comments screen.
export function DiscoverScreen({ profile }: { profile: Profile }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<DiscoverScope>('students');
  const key = searchKey(query);
  const typed = query.trim().length > 0;
  const { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, retry } = useStudentSearch(query, {
    active: scope === 'students',
  });
  // The post list belongs to the last search that settled while Posts was showing.
  const postsKey = useDebouncedValue(key, SEARCH_DEBOUNCE_MS, scope !== 'posts');
  const posts = postsPaneState(scope, key, postsKey);
  const lastOpened = useRef(0);

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
    if (scope === 'students' && hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore, scope]);

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
    /> : <Invitation title="Find fellow students" typed={typed} description="Search by name or username to find students on Penguin." />;
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
  const noPosts = <StatePanel
    icon={Search}
    title="No matches just yet"
    description="Try different words. A broader search can help."
    live
    actionLabel="Clear search"
    onAction={clear}
    footnote="Search matches words in posts, not just exact phrases."
  />;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Discover" />
    <View className="gap-3 px-5 pb-3 pt-2">
      <Input
        variant="search"
        leadingIcon={Search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search your student community"
        accessibilityLabel="Search students and posts"
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
      <SegmentedTabs tabs={discoverScopes} value={scope} onChange={setScope} />
    </View>
    <View className={cn('flex-1', scope !== 'students' && 'hidden')}>
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
    </View>
    <View className={cn('flex-1', scope !== 'posts' && 'hidden')}>
      {posts.mounted ? <View className={cn('flex-1', !posts.current && 'hidden')}>
        <FeedList
          key={postsKey}
          search={postsKey}
          paused={!posts.shown}
          emptyState={noPosts}
          onOpenAuthor={openStudent}
        />
      </View> : null}
      {posts.current ? null : posts.pending ? <View className="px-4"><FeedSkeleton /></View>
        : <View className="px-5"><Invitation title="Find posts" typed={typed} description="Search for words in posts shared by students." /></View>}
    </View>
  </SafeAreaView>;
}
