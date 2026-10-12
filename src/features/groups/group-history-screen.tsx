import { useCallback } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { History, ShieldAlert } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { publicationAccessibilityLabel, relativePublicationTime } from '@/features/posts/post-presentation';
import type { GroupAdminEventListing } from '@/lib/database.types';
import { adminEventText, groupEventId } from './groups';
import { useGroupAdminEvents } from './use-groups';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

function EventRow({ event }: { event: GroupAdminEventListing }) {
  const text = adminEventText(event);
  return <View
    className="min-h-14 justify-center gap-0.5 border-b border-divider px-5 py-3"
    accessible
    accessibilityLabel={`${text} ${publicationAccessibilityLabel(event.created_at).replace('Published', 'On')}`}
  >
    <Text>{text}</Text>
    <Text variant="caption" className="text-muted-foreground">{relativePublicationTime(event.created_at)}</Text>
  </View>;
}

function ListSkeleton() {
  return <View accessibilityLabel="Loading admin history" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="min-h-14 justify-center gap-2 px-5 py-3">
      <Skeleton className="h-3 w-56 rounded-full" />
      <Skeleton className="h-2.5 w-16 rounded-full" />
    </View>)}
  </View>;
}

// The administration history of one group, newest first, for its owner and admins:
// who was made an admin, removed, banned or unbanned, when ownership changed and
// when the group was renamed. It is read-only. The database decides what each
// viewer sees: the owner everything, an admin removals and bans only, and nobody an
// entry about a student who is unavailable to them. Anyone who is not staff gets a
// refusal, shown here as "not available".
export function GroupHistoryScreen({ groupId }: { groupId: string | null }) {
  const insets = useSafeAreaInsets();
  const { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, refresh } = useGroupAdminEvents(groupId);

  const renderEvent = useCallback<ListRenderItem<GroupAdminEventListing>>(({ item }) => <EventRow event={item} />, []);
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  const empty = status === 'loading' || status === 'idle' ? (groupId ? <ListSkeleton /> : <StatePanel
    icon={ShieldAlert} title="Not available" description="This group isn’t available." actionLabel="Go back" onAction={goBack}
  />) : status === 'error' ? <StatePanel
    icon={ShieldAlert}
    title="Admin history isn’t available"
    description="Only this group’s owner and admins can see it. Check your connection, then try again."
    live
    actionLabel="Try again"
    onAction={refresh}
  /> : <StatePanel
    icon={History}
    title="Nothing yet"
    description="Role changes, removals, bans and edits to this group will be listed here."
  />;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more history" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
  </View> : status === 'ready' && !hasMore ? <Text className="pt-5 text-center text-footnote text-muted-foreground">
    That’s the whole history you can see.
  </Text> : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Admin history" onBack={goBack} />
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      data={items}
      renderItem={renderEvent}
      keyExtractor={groupEventId}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={14}
      windowSize={7}
      accessibilityLabel="Admin history"
    />
  </SafeAreaView>;
}
