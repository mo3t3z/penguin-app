import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, View, type ListRenderItem } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Plus, Search, Users, WifiOff } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from '@/features/discover/search-query';
import type { GroupRole } from '@/lib/database.types';
import { GroupRow, GroupRowsSkeleton } from './group-row';
import type { GroupSummary } from './groups';
import { useGroupDiscovery, useMyGroups } from './use-groups';

const OPEN_INTERVAL = 800;

// The screen is one list: section titles, the student's own groups, then the
// groups to discover.
type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'group'; key: string; group: GroupSummary; role: GroupRole | null }
  | { kind: 'mine-loading' | 'mine-empty' | 'mine-error' | 'mine-more'; key: string };
const keyExtractor = (row: Row) => row.key;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/discover');
}

// Groups, opened from Discover and shown above the tabs. With no search it lists
// "My groups" (most recently joined first) and then "Discover groups" (newest
// first, no ranking). A search replaces both with the matching groups. Both lists
// reload whenever the screen comes back into view, so joining, leaving or creating
// a group elsewhere is reflected here.
export function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const mine = useMyGroups();
  const discover = useGroupDiscovery(query);
  const searching = discover.key.length > 0;
  const typed = query.trim().length > 0;
  const lastOpened = useRef(0);
  const focusedOnce = useRef(false);
  const { refresh: refreshMine } = mine;
  const { refresh: refreshDiscover } = discover;

  // The first focus is the initial load; later ones are returns from another screen.
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    refreshMine();
    refreshDiscover();
  }, [refreshDiscover, refreshMine]));

  const throttled = useCallback((action: () => void) => {
    const now = Date.now();
    if (now - lastOpened.current < OPEN_INTERVAL) return;
    lastOpened.current = now;
    Keyboard.dismiss();
    action();
  }, []);
  const open = useCallback((groupId: string) => throttled(() => {
    router.push({ pathname: '/groups/[id]', params: { id: groupId } });
  }), [throttled]);
  const create = useCallback(() => throttled(() => router.push('/groups/new')), [throttled]);
  const clear = useCallback(() => setQuery(''), []);

  const rows = useMemo<Row[]>(() => {
    const found = discover.items.map((group): Row => ({ kind: 'group', key: `discover-${group.id}`, group, role: group.my_role }));
    if (searching) return [{ kind: 'section', key: 'section-results', title: 'Results' }, ...found];
    const own: Row[] = mine.status === 'ready'
      ? [
        ...mine.items.map(({ group, role }): Row => ({ kind: 'group', key: `mine-${group.id}`, group, role })),
        ...(mine.hasMore || mine.loadingMore || mine.loadMoreFailed ? [{ kind: 'mine-more', key: 'mine-more' } as const] : []),
      ]
      : [{ kind: mine.status === 'error' ? 'mine-error' : mine.status === 'empty' ? 'mine-empty' : 'mine-loading', key: 'mine-state' }];
    return [
      { kind: 'section', key: 'section-mine', title: 'My groups' },
      ...own,
      { kind: 'section', key: 'section-discover', title: 'Discover groups' },
      ...found,
    ];
  }, [discover.items, mine.hasMore, mine.items, mine.loadMoreFailed, mine.loadingMore, mine.status, searching]);

  const { loadMore: loadMoreMine, loadingMore: loadingMoreMine, loadMoreFailed: loadMoreMineFailed } = mine;
  const renderRow = useCallback<ListRenderItem<Row>>(({ item }) => {
    if (item.kind === 'group') return <GroupRow group={item.group} role={item.role} onOpen={open} />;
    if (item.kind === 'section') return <View className="min-h-12 justify-center px-5">
      <Text variant="h4" accessibilityRole="header">{item.title}</Text>
    </View>;
    if (item.kind === 'mine-loading') return <GroupRowsSkeleton label="Loading your groups" />;
    if (item.kind === 'mine-empty') return <Text className="px-5 pb-3 text-footnote text-muted-foreground">
      You haven’t joined a group yet. Join one below or create your own.
    </Text>;
    if (item.kind === 'mine-error') return <View className="flex-row flex-wrap items-center gap-x-2 px-5 pb-1">
      <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">Your groups couldn’t load.</Text>
      <Button variant="link" className="px-0" accessibilityLabel="Try loading your groups again" onPress={refreshMine}><Text>Try again</Text></Button>
    </View>;
    return <View className="items-start gap-1 px-5 pb-2">
      {loadMoreMineFailed ? <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">More of your groups couldn’t load.</Text> : null}
      <Button variant="link" className="px-0" loading={loadingMoreMine} accessibilityLabel="Show more of your groups" onPress={loadMoreMine}>
        <Text>{loadMoreMineFailed ? 'Try again' : 'Show more'}</Text>
      </Button>
    </View>;
  }, [loadMoreMine, loadMoreMineFailed, loadingMoreMine, open, refreshMine]);

  const { hasMore, loadingMore, loadMoreFailed, loadMore } = discover;
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  // Everything under the last section title that is not a group row.
  const footer = discover.status === 'loading' || discover.status === 'idle' ? <GroupRowsSkeleton label={searching ? 'Searching groups' : 'Loading groups'} />
    : discover.status === 'error' ? <StatePanel
      icon={WifiOff}
      title="Groups couldn’t load"
      description="Check your connection and try again."
      live
      actionLabel="Try again"
      onAction={refreshDiscover}
    /> : discover.status === 'empty' ? (searching ? <StatePanel
      icon={Search}
      title="No groups match"
      description="Try a different word, or create the group yourself."
      live
      actionLabel="Clear search"
      onAction={clear}
    /> : <StatePanel
      icon={Users}
      title="No groups yet"
      description="Be the first to start one for your class, club or project."
      actionLabel="Create a group"
      primaryAction
      onAction={create}
    />) : loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more groups" accessibilityState={{ busy: true }}>
      <Skeleton className="h-2.5 w-24 rounded-full" />
    </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
      <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
        More groups couldn’t load. Check your connection and try again.
      </Text>
      <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
    </View> : !hasMore ? <Text className="pt-5 text-center text-footnote text-muted-foreground">
      {searching ? 'That’s every group that matches.' : 'That’s every group.'}
    </Text> : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Groups" onBack={goBack} actions={<IconButton icon={Plus} accessibilityLabel="Create a group" onPress={create} />} />
    <View className="gap-1 px-5 pb-2">
      <Input
        variant="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search groups"
        accessibilityLabel="Search groups"
        maxLength={SEARCH_MAX_LENGTH}
        onSubmitEditing={() => Keyboard.dismiss()}
      />
      {typed && !searching ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">
        Type at least {SEARCH_MIN_LENGTH} letters or numbers.
      </Text> : null}
      {discover.refreshFailed || mine.refreshFailed ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">
        Couldn’t refresh. This list may be out of date.
      </Text> : null}
    </View>
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      data={rows}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      accessibilityLabel="Groups"
    />
  </SafeAreaView>;
}
