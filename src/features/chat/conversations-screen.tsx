import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, View, type ListRenderItem } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MessageCircle, SquarePen, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import type { ConversationSummary } from './chat';
import { ConversationRow } from './conversation-row';
import { useConversations } from './use-conversations';

const OPEN_INTERVAL = 800;
const keyExtractor = (item: ConversationSummary) => item.id;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function findStudents() {
  router.navigate('/discover');
}

function ListSkeleton() {
  return <View accessibilityLabel="Loading conversations" accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <View key={item} className="min-h-[72px] flex-row items-center gap-3 border-b border-border py-3">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-[134px] rounded-full" />
        <Skeleton className="h-2.5 w-[190px] rounded-full" />
      </View>
    </View>)}
  </View>;
}

// Figma "Messages": title bar with back and compose, then the conversations, most
// recent first. The list reloads whenever the screen comes back into view, which
// is how a reply shows up before live delivery arrives in Sprint 6B.
export function ConversationsScreen({ userId }: { userId: string }) {
  const { scheme } = usePenguinTheme();
  const { status, items, hasMore, loadingMore, loadMoreFailed, refreshFailed, refresh, loadMore } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  const lastOpened = useRef(0);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); }
    finally { setRefreshing(false); }
  }, [refresh]);
  const open = useCallback((conversationId: string) => {
    const now = Date.now();
    if (now - lastOpened.current < OPEN_INTERVAL) return;
    lastOpened.current = now;
    router.push({ pathname: '/messages/[conversationId]', params: { conversationId } });
  }, []);
  const renderRow = useCallback<ListRenderItem<ConversationSummary>>(
    ({ item }) => <ConversationRow conversation={item} userId={userId} onOpen={open} />,
    [open, userId],
  );
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) void loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  const empty = status === 'loading' ? <ListSkeleton />
    : status === 'error' ? <StatePanel
      icon={WifiOff}
      title="Messages couldn’t load"
      description="Check your connection and try again."
      live
      actionLabel="Try again"
      onAction={() => void refresh()}
    /> : <StatePanel
      icon={MessageCircle}
      title="No messages yet"
      description="Open a student’s profile and tap Message to start a conversation."
      actionLabel="Find students"
      onAction={findStudents}
    />;
  const header = status === 'ready' ? <View className="gap-2 pb-1">
    <Text variant="caption" className="text-muted-foreground">Good conversations start with a shared question.</Text>
    {refreshFailed ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">
      Couldn’t refresh. Pull down to try again.
    </Text> : null}
  </View> : null;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more conversations" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More conversations couldn’t load.
    </Text>
    <Button variant="outline" onPress={() => void loadMore()}><Text>Retry loading more</Text></Button>
  </View> : status === 'ready' && !hasMore ? <Text variant="caption" className="pt-5 text-center text-muted-foreground">
    You’re all caught up with your other chats.
  </Text> : null;

  return <SafeAreaView className="flex-1 bg-background">
    <TopBar
      title="Messages"
      onBack={goBack}
      actions={<IconButton icon={SquarePen} accessibilityLabel="Find a student to message" onPress={findStudents} />}
    />
    <FlatList
      className="flex-1"
      contentContainerClassName="px-5 pb-6 pt-2"
      data={items}
      renderItem={renderRow}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      refreshControl={<RefreshControl
        refreshing={refreshing}
        onRefresh={() => void pullToRefresh()}
        colors={[colors[scheme].primary]}
        tintColor={colors[scheme].primary}
        progressBackgroundColor={colors[scheme].card}
      />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      accessibilityLabel="Conversations"
    />
  </SafeAreaView>;
}
