import { useCallback, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, ChevronRight, Search, UsersRound, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavContentPadding } from '@/components/navigation/use-nav-layout';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FeedList } from '@/features/posts/feed-list';
import type { Profile } from '@/lib/database.types';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { POSTS_SEARCH_DELAY_MS, postsSearchKey, STUDENT_ROW_SIZE } from './discover-results';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, searchKey } from './search-query';
import { STUDENT_TILE_WIDTH, StudentResultRow, StudentTile } from './student-result-row';
import type { StudentResult } from './student-search';
import { useStudentSearch } from './use-student-search';

const OPEN_PROFILE_INTERVAL = 800;
const keyExtractor = (item: StudentResult) => item.id;

function TilesSkeleton() {
  return <View className="flex-row gap-3 px-5" accessibilityLabel="Searching students" accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <View key={item} className="items-center gap-2 rounded-md border border-border bg-card px-3 py-4" style={{ width: STUDENT_TILE_WIDTH }}>
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-3 w-20 rounded-full" />
      <Skeleton className="h-2.5 w-24 rounded-full" />
    </View>)}
  </View>;
}

function RowsSkeleton() {
  return <View accessibilityLabel="Searching students" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-44 rounded-full" />
      </View>
    </View>)}
  </View>;
}

// Discover: the header is the search field, and one list answers it with a row of
// students and then the posts. Students are asked for first and posts only once
// the search has settled (see discover-results.ts), so fast typing requests
// nothing. "See all" swaps the row for the full, paged list of students. The screen
// stays mounted under a pushed profile or comments screen.
export function DiscoverScreen({ profile }: { profile: Profile }) {
  const [query, setQuery] = useState('');
  const [submittedKey, setSubmittedKey] = useState('');
  const [allStudentsKey, setAllStudentsKey] = useState<string | null>(null);
  const key = searchKey(query);
  const typed = query.trim().length > 0;
  // The full list belongs to one search: changing the text returns to the overview.
  const showAll = allStudentsKey !== null && allStudentsKey === key;
  const row = useStudentSearch(query, { pageSize: STUDENT_ROW_SIZE, active: !showAll });
  const all = useStudentSearch(query, { active: showAll });
  const settledKey = useDebouncedValue(key, POSTS_SEARCH_DELAY_MS);
  const postsKey = postsSearchKey(key, settledKey, submittedKey);
  const paddingBottom = useNavContentPadding();
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
  const openGroups = useCallback(() => {
    const now = Date.now();
    if (now - lastOpened.current < OPEN_PROFILE_INTERVAL) return;
    lastOpened.current = now;
    Keyboard.dismiss();
    router.push('/groups');
  }, []);
  const clear = useCallback(() => setQuery(''), []);
  // The keyboard's Search key asks for posts at once instead of waiting.
  const submit = () => { Keyboard.dismiss(); setSubmittedKey(key); };
  const renderStudent = useCallback<ListRenderItem<StudentResult>>(
    ({ item }) => <StudentResultRow student={item} onOpen={openStudent} />,
    [openStudent],
  );
  const { hasMore, loadingMore, loadMoreFailed, loadMore } = all;
  const onEndReached = useCallback(() => {
    if (showAll && hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore, showAll]);

  const searched = query.trim();
  const students = <View className="gap-1 pb-2">
    <View className="min-h-12 flex-row items-center justify-between px-5">
      <Text variant="h4" accessibilityRole="header">Students</Text>
      {row.status === 'ready' && row.hasMore ? <Button variant="link" className="px-0" accessibilityLabel="See all students" onPress={() => setAllStudentsKey(key)}>
        <Text>See all</Text>
      </Button> : null}
    </View>
    {row.status === 'ready' ? <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="gap-3 px-5"
      accessibilityLabel={`${row.items.length}${row.hasMore ? ' or more' : ''} ${row.items.length === 1 && !row.hasMore ? 'student' : 'students'}`}
    >
      {row.items.map((student) => <StudentTile key={student.id} student={student} onOpen={openStudent} />)}
    </ScrollView> : row.status === 'error' ? <View className="flex-row flex-wrap items-center gap-x-2 px-5">
      <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">Students couldn’t load.</Text>
      <Button variant="link" className="px-0" accessibilityLabel="Try loading students again" onPress={row.retry}><Text>Try again</Text></Button>
    </View> : row.status === 'empty' ? <Text className="px-5 pb-2 text-footnote text-muted-foreground" accessibilityLiveRegion="polite">
      No students match “{searched}”.
    </Text> : <TilesSkeleton />}
  </View>;
  // With no student either, nothing matched at all.
  const noPosts = row.status === 'empty' ? <StatePanel
    icon={Search}
    title="No matches just yet"
    description="Try a different name or word."
    live
    actionLabel="Clear search"
    onAction={clear}
  /> : <View className="gap-1 px-5">
    <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">No posts match “{searched}”.</Text>
    <Text className="text-footnote text-muted-foreground">Search matches words in posts, not exact phrases.</Text>
  </View>;

  const allEmpty = all.status === 'loading' || all.status === 'idle' ? <RowsSkeleton />
    : all.status === 'error' ? <StatePanel
      icon={WifiOff}
      title="Search couldn’t load"
      description="Check your connection and try again."
      live
      actionLabel="Try again"
      onAction={all.retry}
    /> : <StatePanel
      icon={Search}
      title="No matches just yet"
      description="Try a different name or word."
      live
      actionLabel="Clear search"
      onAction={clear}
    />;
  const allFooter = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more students" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More students couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
  </View> : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <View className="h-16 justify-center px-5">
      <Input
        variant="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search students and posts"
        accessibilityLabel="Search students and posts"
        maxLength={SEARCH_MAX_LENGTH}
        onSubmitEditing={submit}
      />
    </View>
    {!key ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom }}>
      {/* The way into Groups, which are screens above the tabs and not a tab. */}
      <Pressable
        className="min-h-18 flex-row items-center gap-3 border-b border-divider px-5 py-3 active:bg-muted"
        role="button"
        accessibilityLabel="Groups. Find, join and create student groups"
        onPress={openGroups}
      >
        <View className="size-12 items-center justify-center rounded-md bg-accent">
          <Icon as={UsersRound} size={24} color="accent-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-inter-semibold">Groups</Text>
          <Text variant="callout" numberOfLines={1} className="text-muted-foreground">Find, join and create student groups</Text>
        </View>
        <Icon as={ChevronRight} color="muted-foreground" />
      </Pressable>
      <StatePanel
        icon={Search}
        title="Find students and posts"
        description={typed ? `Type at least ${SEARCH_MIN_LENGTH} letters or numbers.` : 'Search by name, @username or words in a post.'}
        live={typed}
      />
    </ScrollView> : showAll ? <>
      <View className="h-12 flex-row items-center gap-1 pl-1 pr-5">
        <IconButton icon={ArrowLeft} accessibilityLabel="Back to all results" onPress={() => setAllStudentsKey(null)} />
        <Text variant="h4" className="flex-1" accessibilityRole="header">Students</Text>
        {all.status === 'ready' ? <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">
          {all.items.length}{hasMore ? '+' : ''} {all.items.length === 1 && !hasMore ? 'student' : 'students'}
        </Text> : null}
      </View>
      <FlatList
        className="flex-1"
        contentContainerStyle={{ paddingBottom }}
        data={all.items}
        renderItem={renderStudent}
        keyExtractor={keyExtractor}
        ListEmptyComponent={allEmpty}
        ListFooterComponent={allFooter}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        accessibilityLabel="Student search results"
      />
    </> : postsKey ? <FeedList
      key={postsKey}
      search={postsKey}
      header={<View>
        {students}
        <View className="min-h-12 justify-center px-5"><Text variant="h4" accessibilityRole="header">Posts</Text></View>
      </View>}
      emptyState={noPosts}
      onOpenAuthor={openStudent}
      underNavigation
    /> : <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom }}>
      {students}
    </ScrollView>}
  </SafeAreaView>;
}
