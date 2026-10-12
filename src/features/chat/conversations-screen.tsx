import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View, type ListRenderItem } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MessageCircle, SquarePen, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { useNavContentPadding } from '@/components/navigation/use-nav-layout';
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

// The inbox is one list: section titles and conversations.
type InboxItem =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'conversation'; key: string; conversation: ConversationSummary };
const keyExtractor = (item: InboxItem) => item.key;

function ListSkeleton() {
  return <View accessibilityLabel="Loading conversations" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-48 rounded-full" />
      </View>
    </View>)}
  </View>;
}

// The Messages tab: the title with New message, then the conversations in two
// sections, Unread and Earlier, most recent first in each. The Unread section has
// no count, because unread is known only for the conversations loaded so far.
// Previews, order and unread dots update live; the list also reloads whenever the
// tab comes back into view, which keeps it right even if live delivery is
// unavailable.
export function ConversationsScreen({ userId }: { userId: string }) {
  const { scheme } = usePenguinTheme();
  const { status, items, unreadIds, hasMore, loadingMore, loadMoreFailed, refreshFailed, refresh, loadMore } = useConversations({ live: true });
  const [refreshing, setRefreshing] = useState(false);
  const lastOpened = useRef(0);
  const paddingBottom = useNavContentPadding();

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refresh(); }
    finally { setRefreshing(false); }
  }, [refresh]);
  const throttled = useCallback((action: () => void) => {
    const now = Date.now();
    if (now - lastOpened.current < OPEN_INTERVAL) return;
    lastOpened.current = now;
    action();
  }, []);
  const open = useCallback((conversationId: string) => throttled(() => {
    router.push({ pathname: '/messages/[conversationId]', params: { conversationId } });
  }), [throttled]);
  const compose = useCallback(() => throttled(() => router.push('/messages/new')), [throttled]);

  // Section titles appear only when something is unread; otherwise it is one plain list.
  const rows = useMemo<InboxItem[]>(() => {
    const row = (conversation: ConversationSummary): InboxItem => ({ kind: 'conversation', key: conversation.id, conversation });
    const unread = items.filter((item) => unreadIds.has(item.id));
    if (!unread.length) return items.map(row);
    const earlier = items.filter((item) => !unreadIds.has(item.id));
    return [
      { kind: 'section', key: 'section-unread', title: 'Unread' },
      ...unread.map(row),
      ...(earlier.length ? [{ kind: 'section', key: 'section-earlier', title: 'Earlier' } as const, ...earlier.map(row)] : []),
    ];
  }, [items, unreadIds]);
  const renderRow = useCallback<ListRenderItem<InboxItem>>(({ item }) => item.kind === 'section'
    ? <Text className="px-5 pb-1 pt-3 text-footnote font-inter-semibold text-muted-foreground" accessibilityRole="header">{item.title}</Text>
    : <ConversationRow conversation={item.conversation} userId={userId} unread={unreadIds.has(item.conversation.id)} onOpen={open} />,
  [open, unreadIds, userId]);
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
      title="No conversations yet"
      description="Message a student from their profile or start one here."
      actionLabel="New message"
      primaryAction
      onAction={compose}
    />;
  const header = refreshFailed ? <Text variant="caption" className="px-5 pb-2 text-muted-foreground" accessibilityLiveRegion="polite">
    Couldn’t refresh. Pull down to try again.
  </Text> : null;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more conversations" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More conversations couldn’t load.
    </Text>
    <Button variant="outline" onPress={() => void loadMore()}><Text>Retry loading more</Text></Button>
  </View> : status === 'ready' && !hasMore && items.length ? <Text className="pt-5 text-center text-footnote text-muted-foreground">
    You’re all caught up.
  </Text> : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Messages" actions={<IconButton icon={SquarePen} accessibilityLabel="New message" onPress={compose} />} />
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom }}
      data={rows}
      renderItem={renderRow}
      extraData={unreadIds}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      refreshControl={<RefreshControl
        refreshing={refreshing}
        onRefresh={() => void pullToRefresh()}
        colors={[colors[scheme]['primary-text']]}
        tintColor={colors[scheme]['primary-text']}
        progressBackgroundColor={colors[scheme]['surface-raised']}
      />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      accessibilityLabel="Conversations"
    />
  </SafeAreaView>;
}
