import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View, type ListRenderItem, type ViewToken } from 'react-native';
import { Users, WifiOff } from 'lucide-react-native';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import type { FeedPost } from './feed';
import { postPublishedEvents } from './feed-events';
import { PostCard } from './post-card';
import { usePostsFeed } from './use-feed';

// Figma "Skeleton loader / Feed": a borderless card with an avatar, text lines, an
// image block and three action pills.
export function FeedSkeleton({ count = 2 }: { count?: number }) {
  return <View className="gap-5" accessibilityLabel="Loading posts" accessibilityState={{ busy: true }}>
    {Array.from({ length: count }, (_, item) => <View key={item} className="gap-[18px] rounded-lg bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <View className="gap-2"><Skeleton className="h-3 w-[134px] rounded-full" /><Skeleton className="h-2.5 w-[90px] rounded-full" /></View>
      </View>
      <Skeleton className="h-3 w-[88%] rounded-full" />
      <Skeleton className="h-3 w-[79%] rounded-full" />
      <Skeleton className="h-3 w-[58%] rounded-full" />
      <View className="h-[180px] rounded-sm bg-muted" />
      <View className="flex-row gap-6">
        <Skeleton className="h-2.5 w-[52px] rounded-full" /><Skeleton className="h-2.5 w-16 rounded-full" /><Skeleton className="h-2.5 w-10 rounded-full" />
      </View>
    </View>)}
  </View>;
}

function EmptyFeed() {
  return <StatePanel
    icon={Users}
    title="The campus is quiet"
    description="New student posts will appear here. Share the first one, or pull down to check again."
    actionLabel="Create a post"
    onAction={() => router.push('/create-post')}
  />;
}

function ItemSeparator() {
  return <View className="h-5" />;
}

const keyExtractor = (item: FeedPost) => item.id;
const feedViewabilityConfig = { itemVisiblePercentThreshold: 15, minimumViewTime: 100 };
const noPosts: FeedPost[] = [];

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

type FeedListProps = {
  header?: ReactElement;
  // Limits the list to one student's posts (Profile tab, student profile).
  authorId?: string | null;
  // Shown instead of the default empty feed when there are no posts.
  emptyState?: ReactElement;
  // Shown under the header in place of the posts (a profile's About tab). The
  // loaded posts are kept, so switching back does not reload them.
  replacement?: ReactElement;
  onOpenAuthor?: (authorId: string) => void;
};

export function FeedList({ header, authorId = null, emptyState, replacement, onOpenAuthor }: FeedListProps) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { scheme } = usePenguinTheme();
  const list = useRef<FlatList<FeedPost>>(null);
  const {
    status, items, nextCursor, loadingMore, error, errorKind,
    likesByPostId, commentCountsByPostId, refresh: refreshFeed, loadMore: loadMoreFeed, toggleLike,
  } = usePostsFeed({ authorId });
  const [refreshing, setRefreshing] = useState(false);
  const [visiblePostIds, setVisiblePostIds] = useState<ReadonlySet<string>>(() => new Set());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<FeedPost>[] }) => {
    const next = new Set(viewableItems.filter((token) => token.isViewable).map((token) => token.item.id));
    setVisiblePostIds((current) => sameIds(current, next) ? current : next);
  }, []);
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshFeed(); }
    finally { setRefreshing(false); }
  }, [refreshFeed, refreshing]);
  // A post published by this account refreshes every mounted list that can contain
  // it (the main feed and the author's own posts) and returns to the top, where the
  // new post appears. Existing posts stay mounted while it loads.
  useEffect(() => postPublishedEvents.subscribe((event) => {
    if (!userId || event.userId !== userId) return;
    if (authorId && authorId !== userId) return;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    void refresh();
  }), [authorId, refresh, userId]);
  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore) void loadMoreFeed();
  }, [loadMoreFeed, loadingMore, nextCursor]);
  const openComments = useCallback((postId: string) => {
    router.push({ pathname: '/comments/[postId]', params: { postId } });
  }, []);
  const renderPost = useCallback<ListRenderItem<FeedPost>>(({ item }) => <PostCard
    post={item}
    visible={visiblePostIds.has(item.id)}
    likeState={likesByPostId[item.id]}
    commentCount={commentCountsByPostId[item.id]}
    onToggleLike={toggleLike}
    onOpenComments={openComments}
    onOpenAuthor={onOpenAuthor}
  />, [commentCountsByPostId, likesByPostId, onOpenAuthor, openComments, toggleLike, visiblePostIds]);
  const extraData = useMemo(
    () => ({ commentCountsByPostId, likesByPostId, visiblePostIds }),
    [commentCountsByPostId, likesByPostId, visiblePostIds],
  );

  const initialLoading = status === 'idle' || status === 'loading';
  const empty = initialLoading ? <FeedSkeleton count={authorId ? 1 : 2} />
    : status === 'error' ? <StatePanel
      icon={WifiOff}
      title="Posts couldn’t load"
      description={error}
      live
      actionLabel="Try again"
      onAction={() => void refreshFeed()}
    /> : emptyState ?? <EmptyFeed />;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more posts" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : error && items.length ? <View className="gap-3 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">{error}</Text>
    <Button variant="outline" onPress={() => errorKind === 'refresh' ? void refresh() : void loadMoreFeed()}>
      <Text>{errorKind === 'refresh' ? 'Retry refresh' : 'Retry loading more'}</Text>
    </Button>
  </View> : items.length && !nextCursor ? <Text variant="caption" className="pt-5 text-center text-muted-foreground">
    You’re all caught up.
  </Text> : null;

  return <FlatList
    ref={list}
    className="flex-1 bg-background"
    contentContainerClassName="px-4 pb-6"
    data={replacement ? noPosts : items}
    renderItem={renderPost}
    extraData={extraData}
    keyExtractor={keyExtractor}
    ListHeaderComponent={header ?? null}
    ListHeaderComponentStyle={header ? { marginBottom: 20 } : undefined}
    ItemSeparatorComponent={ItemSeparator}
    ListEmptyComponent={replacement ?? empty}
    ListFooterComponent={replacement ? null : footer}
    refreshControl={<RefreshControl
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      colors={[colors[scheme].primary]}
      tintColor={colors[scheme].primary}
      progressBackgroundColor={colors[scheme].card}
    />}
    onEndReached={replacement ? undefined : loadMore}
    onEndReachedThreshold={0.4}
    onViewableItemsChanged={onViewableItemsChanged}
    viewabilityConfig={feedViewabilityConfig}
    initialNumToRender={6}
    maxToRenderPerBatch={6}
    windowSize={7}
    keyboardShouldPersistTaps="handled"
    accessibilityLabel={authorId ? 'Student posts' : 'Student posts feed'}
  />;
}
