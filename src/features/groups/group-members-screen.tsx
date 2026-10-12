import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View, type ListRenderItem } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ellipsis, UserRound, UsersRound, WifiOff } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import {
  adminActionCopy,
  groupAdminErrors,
  groupErrorKind,
  groupMemberId,
  memberActions,
  memberRoleBadge,
  showUnavailableMembers,
  UNAVAILABLE_MEMBERS_CAPTION,
  unavailableMembersLabel,
  type GroupAdminAction,
  type GroupMemberRow,
} from './groups';
import { MemberActionsSheet } from './member-actions-sheet';
import { runMemberAction } from './service';
import { useGroupDetails, useGroupMembers } from './use-groups';

const OPEN_INTERVAL = 800;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

// One member: the row opens their profile. A "Manage" button appears only when the
// viewer may do something to this member; it is a separate target beside the row.
function MemberRow({ member, own, manageable, busy, onOpen, onManage }: {
  member: GroupMemberRow;
  own: boolean;
  manageable: boolean;
  busy: boolean;
  onOpen: (userId: string) => void;
  onManage: (member: GroupMemberRow) => void;
}) {
  const name = profileDisplayName(member.profile?.display_name ?? null);
  const username = member.profile?.username?.trim() || 'student';
  const badge = memberRoleBadge(member.role);
  return <View className="flex-row items-center pr-2">
    <Pressable
      className="min-h-18 min-w-0 flex-1 flex-row items-center gap-3 py-2 pl-5 pr-2 active:bg-muted"
      role="button"
      accessibilityLabel={`View ${name}’s profile. @${username}${badge ? `. Group ${badge.toLowerCase()}` : ''}${own ? '. You' : ''}`}
      onPress={() => onOpen(member.user_id)}
    >
      <UserAvatar name={name} uri={member.profile?.avatar_url} size="lg" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-inter-semibold">{name}{own ? ' (you)' : ''}</Text>
        <Text variant="callout" numberOfLines={1} className="text-muted-foreground">@{username}</Text>
      </View>
      {badge ? <Badge variant="secondary"><Text>{badge}</Text></Badge> : null}
    </Pressable>
    {manageable ? <IconButton
      icon={Ellipsis}
      accessibilityLabel={`Manage ${name}`}
      disabled={busy}
      onPress={() => onManage(member)}
    /> : null}
  </View>;
}

function ListSkeleton() {
  return <View accessibilityLabel="Loading members" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-24 rounded-full" />
      </View>
    </View>)}
  </View>;
}

// Members who exist but cannot be shown to this viewer, as one entry for all of
// them. The app only ever receives how many there are, so this is not a student: it
// has a generic avatar, no username, no identifier, and it cannot be opened,
// messaged or managed. It gives no reason.
function UnavailableMembers({ count }: { count: number }) {
  const label = unavailableMembersLabel(count);
  return <View
    className="min-h-18 flex-row items-center gap-3 px-5 py-2"
    accessible
    accessibilityLabel={`${label}. ${UNAVAILABLE_MEMBERS_CAPTION}`}
  >
    <View className="size-12 items-center justify-center rounded-full bg-muted" aria-hidden>
      <Icon as={UserRound} size={24} color="muted-foreground" />
    </View>
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="font-inter-semibold">{label}</Text>
      <Text variant="callout" numberOfLines={1} className="text-muted-foreground">{UNAVAILABLE_MEMBERS_CAPTION}</Text>
    </View>
  </View>;
}

// The members of one group in the order they joined, so the owner is first, each
// with a role badge. The group's member count is the actual one, so members who are
// unavailable to this viewer are accounted for by one grouped entry after the last
// visible member: the database sends only their number and leaves their identities
// out.
//
// Staff get a Manage button on the members they may act on. The database decides
// what is allowed; the menu only reflects it. Every action asks for confirmation,
// runs once, and then the list and the viewer's own role are read again from the
// server, so what is shown afterwards is what happened.
export function GroupMembersScreen({ groupId, userId }: { groupId: string | null; userId: string }) {
  const insets = useSafeAreaInsets();
  const { status, items, hasMore, loadingMore, loadMoreFailed, unavailableCount, loadMore, refresh } = useGroupMembers(groupId);
  const { state: group, reload: reloadGroup } = useGroupDetails(groupId);
  const details = group.status === 'ready' ? group.details : null;
  // Only once every page is in, so it is always the last entry and appears once.
  const unavailable = showUnavailableMembers({ status, hasMore, loadingMore, loadMoreFailed, unavailableCount });
  const lastOpened = useRef(0);
  const inFlight = useRef(false);
  const [managing, setManaging] = useState<GroupMemberRow | null>(null);
  const [pending, setPending] = useState<{ action: GroupAdminAction; member: GroupMemberRow } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const focusedOnce = useRef(false);

  // Returning from a profile, the ban list or the history: roles may have changed.
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    refresh();
    void reloadGroup();
  }, [refresh, reloadGroup]));

  const open = useCallback((memberId: string) => {
    // Your own row leads to the Profile tab, as your own result does in Discover.
    if (memberId === userId) { router.navigate('/account'); return; }
    const now = Date.now();
    if (now - lastOpened.current < OPEN_INTERVAL) return;
    lastOpened.current = now;
    router.push({ pathname: '/students/[id]', params: { id: memberId } });
  }, [userId]);

  const actionsFor = useCallback((member: GroupMemberRow) => details ? memberActions({
    viewerRole: details.role, targetRole: member.role, self: member.user_id === userId,
    status: details.group.status, rolesSupported: details.rolesSupported,
  }) : [], [details, userId]);

  // One action at a time: a second confirmation cannot start while one is running.
  async function confirm() {
    if (!pending || !groupId || inFlight.current) return;
    const { action, member } = pending;
    const name = profileDisplayName(member.profile?.display_name ?? null);
    inFlight.current = true; setPending(null); setBusyId(member.user_id); setNotice(null);
    try {
      await runMemberAction(action, groupId, member.user_id);
      setNotice({ text: adminActionCopy[action].done(name), failed: false });
    } catch (cause) {
      setNotice({ text: groupAdminErrors[groupErrorKind(cause)], failed: true });
    }
    // Whatever happened, show what the server now says.
    refresh();
    await reloadGroup();
    inFlight.current = false; setBusyId(null);
  }

  const renderMember = useCallback<ListRenderItem<GroupMemberRow>>(
    ({ item }) => <MemberRow
      member={item}
      own={item.user_id === userId}
      manageable={actionsFor(item).length > 0}
      busy={busyId !== null}
      onOpen={open}
      onManage={setManaging}
    />,
    [actionsFor, busyId, open, userId],
  );
  const onEndReached = useCallback(() => {
    if (hasMore && !loadingMore && !loadMoreFailed) loadMore();
  }, [hasMore, loadMore, loadMoreFailed, loadingMore]);

  const empty = status === 'loading' || status === 'idle' ? (groupId ? <ListSkeleton /> : <StatePanel
    icon={UsersRound} title="Group not found" description="This group isn’t available." actionLabel="Go back" onAction={goBack}
  />) : status === 'error' ? <StatePanel
    icon={WifiOff}
    title="Members couldn’t load"
    description="Check your connection and try again."
    live
    actionLabel="Try again"
    onAction={refresh}
  /> : unavailable ? null : <StatePanel
    icon={UsersRound}
    title="No members to show"
    description="This group has no members."
  />;
  const footer = loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more members" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More members couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={loadMore}><Text>Retry loading more</Text></Button>
  </View> : unavailable ? <UnavailableMembers count={unavailableCount} /> : null;

  const managingName = managing ? profileDisplayName(managing.profile?.display_name ?? null) : '';
  const pendingName = pending ? profileDisplayName(pending.member.profile?.display_name ?? null) : '';
  const pendingCopy = pending ? adminActionCopy[pending.action] : null;

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Members" onBack={goBack} />
    {notice ? <Text
      variant="callout"
      className={notice.failed ? 'px-5 pb-2 text-destructive' : 'px-5 pb-2 text-success'}
      accessibilityLiveRegion="polite"
    >{notice.text}</Text> : null}
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      data={items}
      renderItem={renderMember}
      extraData={busyId}
      keyExtractor={groupMemberId}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      accessibilityLabel="Group members"
    />
    <MemberActionsSheet
      visible={managing !== null}
      name={managingName}
      actions={managing ? actionsFor(managing) : []}
      onClose={() => setManaging(null)}
      onChoose={(action) => { if (managing) setPending({ action, member: managing }); setManaging(null); }}
    />
    <Dialog
      visible={pending !== null}
      title={pendingCopy ? pendingCopy.title(pendingName) : ''}
      description={pendingCopy?.description}
      onClose={() => setPending(null)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setPending(null)}><Text>Cancel</Text></Button>
        <Button variant={pendingCopy?.destructive ? 'destructive' : 'default'} size="sm" onPress={() => void confirm()}>
          <Text>{pendingCopy?.confirm ?? 'Confirm'}</Text>
        </Button>
      </>}
    />
  </SafeAreaView>;
}
