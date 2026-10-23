import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Bell, UserPlus, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import { cn } from '@/lib/utils';
import { notificationEvents } from './events';
import { notificationAge, notificationSentence, notificationTarget } from './notification-text';
import { getNotifications, markNotificationsRead, type NotificationItem } from './service';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function open(item: NotificationItem) {
  const target = notificationTarget(item);
  if (!target) return;
  if (target.kind === 'requests') router.push('/connections/requests');
  else if (target.kind === 'profile') router.push({ pathname: '/students/[id]', params: { id: target.profileId } });
  else router.push({ pathname: '/comments/[postId]', params: { postId: target.postId } });
}

function Row({ item, unread }: { item: NotificationItem; unread: boolean }) {
  const name = item.actor ? profileDisplayName(item.actor.display_name) : 'A student';
  const sentence = notificationSentence[item.type];
  return <Pressable className={cn('flex-row items-center gap-3 border-b border-divider px-5 py-3 active:bg-muted', unread && 'bg-accent')}
    accessibilityRole="button" accessibilityLabel={`${unread ? 'Unread. ' : ''}${name} ${sentence}`} onPress={() => open(item)}>
    <UserAvatar name={name} uri={item.actor?.avatar_url} size="lg" />
    <View className="min-w-0 flex-1">
      <Text className="text-callout"><Text className="font-inter-semibold text-callout">{name}</Text> {sentence}</Text>
      <Text className="text-footnote text-muted-foreground">{notificationAge(item.created_at)}</Text>
    </View>
    {unread ? <View className="size-2.5 rounded-full bg-primary" aria-hidden /> : null}
  </Pressable>;
}

// The student's notices, newest first. Opening the screen marks them read; the rows
// that were unread keep their tint until the student leaves.
export function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getNotifications();
      setItems(next); setFailed(false);
      setUnreadIds(new Set(next.filter(item => !item.read_at).map(item => item.id)));
      if (next.some(item => !item.read_at)) {
        await markNotificationsRead(next[0]?.created_at ?? null);
        notificationEvents.emit();
      }
    } catch { setFailed(true); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } };

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Notifications" onBack={goBack} />
    <Pressable className="flex-row items-center gap-3 border-b border-divider px-5 py-3 active:bg-muted" accessibilityRole="button"
      onPress={() => router.push('/connections/requests')}>
      <Icon as={UserPlus} size={24} color="primary-text" />
      <Text className="flex-1 font-inter-medium">Connection requests</Text>
    </Pressable>
    {failed && !items ? <StatePanel icon={WifiOff} title="Notifications couldn’t load" description="Check your connection and try again."
      live actionLabel="Try again" onAction={() => void load()} />
      : items === null ? <View className="gap-4 p-5" accessibilityLabel="Loading notifications" accessibilityState={{ busy: true }}>
        {[0, 1, 2, 3].map(index => <View key={index} className="flex-row items-center gap-3">
          <Skeleton className="size-12 rounded-full" /><View className="gap-2"><Skeleton className="h-3 w-56 rounded-full" /><Skeleton className="h-2.5 w-12 rounded-full" /></View>
        </View>)}
      </View>
        : <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <Row item={item} unread={unreadIds.has(item.id)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListEmptyComponent={<StatePanel icon={Bell} title="Nothing new"
            description="Comments on your posts, new connections and your connections’ photos appear here." />}
        />}
  </SafeAreaView>;
}
