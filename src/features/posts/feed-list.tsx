import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View, type ListRenderItem, type ViewToken } from 'react-native';
import { Users, WifiOff } from 'lucide-react-native';
import { useNavContentPadding } from '@/components/navigation/use-nav-layout';
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
import { PostSearchResult } from './post-search-result';
import { usePostsFeed } from './use-feed';
import { useReduceMotion } from '@/lib/use-reduce-motion';

// Static placeholders with a post's final geometry: author row, text lines, media
// and the action row, with the same divider below.
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return <View accessibilityLabel="Loading posts" accessibilityState={{ busy: true }}>
    {Array.from({ length: count }, (_, item) => <View key={item} className="gap-3 border-b border-divider px-5 py-4">
      <View className="flex-row items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <View className="gap-2"><Skeleton className="h-3 w-32 rounded-full" /><Skeleton className="h-2.5 w-24 rounded-full" /></View>
      </View>
      <Skeleton className="h-3 w-[88%] rounded-full" />
      <Skeleton className="h-3 w-[79%] rounded-full" />
      <Skeleton className="h-3 w-[58%] rounded-full" />
      <Skeleton className="h-44 w-full" />
      <View className="flex-row gap-6 py-2">
        <Skeleton className="h-2.5 w-12 rounded-full" /><Skeleton className="h-2.5 w-16 rounded-full" /><Skeleton className="h-2.5 w-10 rounded-full" />
      </View>
    </View>)}
  </View>;
}

function EmptyFeed() {
  return <StatePanel
    icon={Users}
    title="Your feed is quiet"
    description="Posts from students appear here. Share the first one."
    actionLabel="Create a post"
    primaryAction
    onAction={() => router.push('/create-post')}
  />;
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
  // Limits the list to posts matching a canonical search key (Discover).
  search?: string | null;
  // A hidden list keeps its posts and scroll position but asks for nothing: no
  // further pages and no image URLs.
  paused?: boolean;
  // The list belongs to a tab screen and scrolls under the navigation, so it ends
  // with enough room for its last item to clear the bar.
  underNavigation?: boolean;
  // Each new value scrolls the list back to its top (the tab was pressed again).
  scrollToTopSignal?: number;
};

export function FeedList({ header, authorId = null, emptyState, replacement, onOpenAuthor, search = null, paused = false, underNavigation = false, scrollToTopSignal = 0 }: FeedListProps) {
  const reduceMotion = useReduceMotion();
  const navigationPadding = useNavContentPadding();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { scheme } = usePenguinTheme();
  const list = useRef<FlatList<FeedPost>>(null);
  const {
    status, items, nextCursor, loadingMore, error, errorKind,
    likesByPostId, commentCountsByPostId, refresh: refreshFeed, loadMore: loadMoreFeed, toggleLike,
  } = usePostsFeed({ authorId, search });
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (scrollToTopSignal) list.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
  }, [reduceMotion, scrollToTopSignal]);
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
  // new post appears. Existing posts stay mounted while it loads. Search results
  // are left as they are.
  useEffect(() => postPublishedEvents.subscribe((event) => {
    if (!userId || event.userId !== userId) return;
    if (authorId && authorId !== userId) return;
    if (search) return;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    void refresh();
  }), [authorId, refresh, search, userId]);
  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore) void loadMoreFeed();
  }, [loadMoreFeed, loadingMore, nextCursor]);
  const openComments = useCallback((postId: string) => {
    router.push({ pathname: '/comments/[postId]', params: { postId } });
  }, []);
  // Search results are compact and open the post's comments; feeds show the full post.
  const renderPost = useCallback<ListRenderItem<FeedPost>>(({ item }) => search ? <PostSearchResult
    post={item}
    search={search}
    onOpen={openComments}
  /> : <PostCard
    post={item}
    visible={!paused && visiblePostIds.has(item.id)}
    likeState={likesByPostId[item.id]}
    commentCount={commentCountsByPostId[item.id]}
    onToggleLike={toggleLike}
    onOpenComments={openComments}
    onOpenAuthor={onOpenAuthor}
  />, [commentCountsByPostId, likesByPostId, onOpenAuthor, openComments, paused, search, toggleLike, visiblePostIds]);
  const extraData = useMemo(
    () => ({ commentCountsByPostId, likesByPostId, paused, visiblePostIds }),
    [commentCountsByPostId, likesByPostId, paused, visiblePostIds],
  );

  const initialLoading = status === 'idle' || status === 'loading';
  const empty = initialLoading ? <FeedSkeleton count={authorId ? 1 : 3} />
    : status === 'error' ? <StatePanel
      icon={WifiOff}
      title={authorId || search ? 'Posts couldn’t load' : 'Your feed couldn’t load'}
      description={error}
      live
      actionLabel="Try again"
      onAction={() => void refreshFeed()}
    /> : emptyState ?? <EmptyFeed />;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more posts" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : error && items.length ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">{error}</Text>
    <Button variant="outline" onPress={() => errorKind === 'refresh' ? void refresh() : void loadMoreFeed()}>
      <Text>{errorKind === 'refresh' ? 'Retry refresh' : 'Retry loading more'}</Text>
    </Button>
  </View> : items.length && !nextCursor ? <Text className="pt-5 text-center text-footnote text-muted-foreground">
    You’re all caught up.
  </Text> : null;

  return <FlatList
    ref={list}
    className="flex-1 bg-background"
    contentContainerStyle={{ paddingBottom: underNavigation ? navigationPadding : 24 }}
    data={replacement ? noPosts : items}
    renderItem={renderPost}
    extraData={extraData}
    keyExtractor={keyExtractor}
    ListHeaderComponent={header ?? null}
    ListEmptyComponent={replacement ?? empty}
    ListFooterComponent={replacement ? null : footer}
    refreshControl={<RefreshControl
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      colors={[colors[scheme]['primary-text']]}
      tintColor={colors[scheme]['primary-text']}
      progressBackgroundColor={colors[scheme]['surface-raised']}
    />}
    onEndReached={replacement || paused ? undefined : loadMore}
    onEndReachedThreshold={0.4}
    onViewableItemsChanged={onViewableItemsChanged}
    viewabilityConfig={feedViewabilityConfig}
    initialNumToRender={6}
    maxToRenderPerBatch={6}
    windowSize={7}
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode={search ? 'on-drag' : 'none'}
    accessibilityLabel={search ? 'Post search results' : authorId ? 'Student posts' : 'Student posts feed'}
  />;
}
