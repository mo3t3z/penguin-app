import { useCallback, useRef, useState } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { Ban, ShieldAlert } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import { groupAdminErrors, groupBanId, groupErrorKind, type GroupBan } from './groups';
import { unbanMember } from './service';
import { useGroupBans } from './use-groups';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

function BanRow({ ban, busy, onUnban }: { ban: GroupBan; busy: boolean; onUnban: (ban: GroupBan) => void }) {
  const name = profileDisplayName(ban.profile.display_name);
  const username = ban.profile.username?.trim() || 'student';
  return <View className="min-h-18 flex-row items-center gap-3 px-5 py-2" accessible={!ban.can_unban} accessibilityLabel={ban.can_unban ? undefined : `${name}. @${username}. Banned`}>
    <UserAvatar name={name} uri={ban.profile.avatar_url} size="lg" />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="font-inter-semibold">{name}</Text>
      <Text variant="callout" numberOfLines={1} className="text-muted-foreground">@{username}</Text>
    </View>
    {ban.can_unban ? <Button variant="outline" size="sm" loading={busy} accessibilityLabel={`Lift the ban on ${name}`} onPress={() => onUnban(ban)}>
      <Text>Lift ban</Text>
    </Button> : null}
  </View>;
}

function ListSkeleton() {
  return <View accessibilityLabel="Loading banned students" accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-24 rounded-full" />
      </View>
    </View>)}
  </View>;
}

// The students banned from one group, newest ban first, for its owner and admins.
// "Lift ban" appears only where the database says this viewer may lift that ban:
// the owner any ban, an admin only a ban they placed on an ordinary member. Lifting
// a ban does not add the student back, and the confirmation says so. The list never
// says who placed a ban. Anyone who is not staff gets a refusal from the database,
// shown here as "not available".
export function GroupBansScreen({ groupId }: { groupId: string | null }) {
  const insets = useSafeAreaInsets();
  const { status, items, hasMore, loadingMore, loadMoreFailed, loadMore, refresh } = useGroupBans(groupId);
  const [pending, setPending] = useState<GroupBan | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const inFlight = useRef(false);

  async function confirm() {
    if (!pending || !groupId || inFlight.current) return;
    const ban = pending;
    const name = profileDisplayName(ban.profile.display_name);
    inFlight.current = true; setPending(null); setBusyId(ban.banned_id); setNotice(null);
    try {
      await unbanMember(groupId, ban.banned_id);
      setNotice({ text: `The ban on ${name} was lifted. They can join again themselves.`, failed: false });
    } catch (cause) {
      setNotice({ text: groupAdminErrors[groupErrorKind(cause)], failed: true });
    }
    refresh();
    inFlight.current = false; setBusyId(null);
  }

  const renderBan = useCallback<ListRenderItem<GroupBan>>(
    ({ item }) => <BanRow ban={item} busy={busyId === item.banned_id} onUnban={setPending} />,
    [busyId],
  );
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  const empty = status === 'loading' || status === 'idle' ? (groupId ? <ListSkeleton /> : <StatePanel
    icon={ShieldAlert} title="Not available" description="This group isn’t available." actionLabel="Go back" onAction={goBack}
  />) : status === 'error' ? <StatePanel
    icon={ShieldAlert}
    title="Banned students aren’t available"
    description="Only this group’s owner and admins can see this list. Check your connection, then try again."
    live
    actionLabel="Try again"
    onAction={refresh}
  /> : <StatePanel
    icon={Ban}
    title="Nobody is banned"
    description="Students you ban from the member list appear here, where a ban can be lifted."
  />;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more banned students" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
  </View> : null;
  const pendingName = pending ? profileDisplayName(pending.profile.display_name) : '';

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Banned students" onBack={goBack} />
    {notice ? <Text
      variant="callout"
      className={notice.failed ? 'px-5 pb-2 text-destructive' : 'px-5 pb-2 text-success'}
      accessibilityLiveRegion="polite"
    >{notice.text}</Text> : null}
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      data={items}
      renderItem={renderBan}
      extraData={busyId}
      keyExtractor={groupBanId}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      accessibilityLabel="Banned students"
    />
    <Dialog
      visible={pending !== null}
      title={`Lift the ban on ${pendingName}?`}
      description="They are not added back to the group. They can join again themselves."
      onClose={() => setPending(null)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setPending(null)}><Text>Cancel</Text></Button>
        <Button size="sm" onPress={() => void confirm()}><Text>Lift ban</Text></Button>
      </>}
    />
  </SafeAreaView>;
}
