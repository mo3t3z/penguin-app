import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { router } from 'expo-router';
import { FlatList, View, type ListRenderItem, type ViewToken } from 'react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import type { FeedPost } from './feed';
import { PostCard } from './post-card';
import { signedMediaMemoryCache } from './private-media';
import { usePostsFeed } from './use-feed';

function FeedSkeleton() {
  return <View className="w-full max-w-lg self-center gap-4" accessibilityLabel="Loading posts" accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <Card key={item} className="gap-0 py-0">
      <CardContent className="gap-4 px-4 py-4">
        <View className="flex-row items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <View className="flex-1 gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></View>
        </View>
        <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" />
      </CardContent>
    </Card>)}
  </View>;
}

function EmptyFeed() {
  return <Card variant="muted" className="w-full max-w-lg self-center">
    <CardContent className="gap-2">
      <Text variant="h3">The campus is quiet</Text>
      <Text variant="muted">New student posts will appear here. Pull down anytime to check again.</Text>
    </CardContent>
  </Card>;
}

const keyExtractor = (item: FeedPost) => item.id;
const feedViewabilityConfig = { itemVisiblePercentThreshold: 15, minimumViewTime: 100 };

function sameIds(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

export function FeedList({ header }: { header?: ReactElement }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const {
    status, items, nextCursor, loadingMore, error, errorKind,
    likesByPostId, commentCountsByPostId, refresh: refreshFeed, loadMore: loadMoreFeed, toggleLike,
  } = usePostsFeed();
  const [refreshing, setRefreshing] = useState(false);
  const [visiblePostIds, setVisiblePostIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    signedMediaMemoryCache.activateUser(userId);
    return () => signedMediaMemoryCache.activateUser(null);
  }, [userId]);
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
  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore) void loadMoreFeed();
  }, [loadMoreFeed, loadingMore, nextCursor]);
  const openComments = useCallback((postId: string) => {
    router.push({ pathname: '/comments/[postId]', params: { postId } });
  }, []);
  const renderPost = useCallback<ListRenderItem<FeedPost>>(({ item }) => <View className="mb-4 w-full max-w-lg self-center">
    <PostCard
      post={item}
      visible={visiblePostIds.has(item.id)}
      likeState={likesByPostId[item.id]}
      commentCount={commentCountsByPostId[item.id]}
      onToggleLike={toggleLike}
      onOpenComments={openComments}
    />
  </View>, [commentCountsByPostId, likesByPostId, openComments, toggleLike, visiblePostIds]);
  const extraData = useMemo(
    () => ({ commentCountsByPostId, likesByPostId, visiblePostIds }),
    [commentCountsByPostId, likesByPostId, visiblePostIds],
  );

  const initialLoading = status === 'idle' || status === 'loading';
  const empty = initialLoading ? <FeedSkeleton />
    : status === 'error' ? <Card variant="muted" className="w-full max-w-lg self-center">
      <CardContent className="gap-3">
        <Text variant="h3">Posts couldn’t load</Text>
        <Text variant="muted">{error}</Text>
        <Button variant="outline" onPress={() => void refreshFeed()}><Text>Retry</Text></Button>
      </CardContent>
    </Card> : <EmptyFeed />;
  const footer = loadingMore ? <View className="w-full max-w-lg self-center gap-3 py-3" accessibilityLabel="Loading more posts" accessibilityState={{ busy: true }}>
    <Skeleton className="h-3 w-24 self-center" />
  </View> : error && items.length ? <View className="w-full max-w-lg self-center gap-2 pb-4">
    <Text variant="muted" className="text-center" accessibilityLiveRegion="polite">{error}</Text>
    <Button variant="outline" onPress={() => errorKind === 'refresh' ? void refresh() : void loadMoreFeed()}>
      <Text>{errorKind === 'refresh' ? 'Retry refresh' : 'Retry loading more'}</Text>
    </Button>
  </View> : null;

  return <FlatList
    className="flex-1 bg-background"
    contentContainerClassName="px-4 pb-10"
    data={items}
    renderItem={renderPost}
    extraData={extraData}
    keyExtractor={keyExtractor}
    ListHeaderComponent={header ?? null}
    ListHeaderComponentStyle={{ marginBottom: 16 }}
    ListEmptyComponent={empty}
    ListFooterComponent={footer}
    refreshing={refreshing}
    onRefresh={() => void refresh()}
    onEndReached={loadMore}
    onEndReachedThreshold={0.4}
    onViewableItemsChanged={onViewableItemsChanged}
    viewabilityConfig={feedViewabilityConfig}
    initialNumToRender={6}
    maxToRenderPerBatch={6}
    windowSize={7}
    keyboardShouldPersistTaps="handled"
    accessibilityLabel="Student posts feed"
  />;
}
