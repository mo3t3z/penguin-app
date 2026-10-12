import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ban, ChevronRight, History, Pencil, UsersRound, WifiOff, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { IdentityRow } from '@/components/social/identity-row';
import { StatePanel } from '@/components/social/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import { GroupAvatar } from './group-avatar';
import { groupAction, groupBadge, groupErrorKind, groupJoinErrors, groupLeaveErrors, isGroupStaff, memberCountLabel } from './groups';
import { joinGroup, leaveGroup, type GroupDetails } from './service';
import { useGroupDetails } from './use-groups';

const OPEN_INTERVAL = 800;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

function DetailsSkeleton() {
  return <View className="items-center gap-3 px-5 pt-6" accessibilityLabel="Loading group" accessibilityState={{ busy: true }}>
    <Skeleton className="size-24 rounded-lg" />
    <Skeleton className="h-5 w-48 rounded-full" />
    <Skeleton className="h-3 w-24 rounded-full" />
    <Skeleton className="mt-3 h-12 w-full rounded-md" />
  </View>;
}

// A row that opens another Groups screen, as the Members row does.
function LinkRow({ icon, label, value, accessibilityLabel, onPress }: {
  icon: LucideIcon; label: string; value?: string; accessibilityLabel: string; onPress: () => void;
}) {
  return <Pressable
    className="-mx-5 min-h-14 flex-row items-center gap-3 border-b border-divider px-5 active:bg-muted"
    role="button"
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
  >
    <Icon as={icon} size={24} />
    <Text className="flex-1 font-inter-semibold">{label}</Text>
    {value ? <Text variant="callout" className="text-muted-foreground">{value}</Text> : null}
    <Icon as={ChevronRight} color="muted-foreground" />
  </Pressable>;
}

function Details({ details, userId, refreshFailed, reload }: {
  details: GroupDetails;
  userId: string;
  refreshFailed: boolean;
  reload: () => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { group, role, owner, rolesSupported } = details;
  const action = groupAction(group.status, role);
  const badge = groupBadge(group.status, role);
  // Administration needs a database that knows roles; reading the ban list and the
  // history stays possible in an archived group, editing does not.
  const staff = rolesSupported && isGroupStaff(role);
  const canEdit = rolesSupported && role === 'owner' && group.status === 'active';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inFlight = useRef(false);
  const lastOpened = useRef(0);

  // Join and Leave share one guard, so a second tap or the other action can never
  // start while one is running. The button stays busy until the group has been
  // read again, so the count and the action shown afterwards come from the server.
  async function change(run: (groupId: string) => Promise<void>, messages: typeof groupJoinErrors) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      await run(group.id);
    } catch (cause) {
      setError(messages[groupErrorKind(cause)]);
    }
    await reload();
    inFlight.current = false; setBusy(false);
  }

  const openOnce = (open: () => void) => {
    const now = Date.now();
    if (now - lastOpened.current < OPEN_INTERVAL) return;
    lastOpened.current = now;
    open();
  };
  const openMembers = () => openOnce(() => router.push({ pathname: '/groups/[id]/members', params: { id: group.id } }));
  const openEdit = () => openOnce(() => router.push({ pathname: '/groups/[id]/edit', params: { id: group.id } }));
  const openBans = () => openOnce(() => router.push({ pathname: '/groups/[id]/bans', params: { id: group.id } }));
  const openHistory = () => openOnce(() => router.push({ pathname: '/groups/[id]/history', params: { id: group.id } }));
  const openOwner = (ownerId: string) => openOnce(() => {
    if (ownerId === userId) router.navigate('/account');
    else router.push({ pathname: '/students/[id]', params: { id: ownerId } });
  });
  const ownerName = owner?.profile ? profileDisplayName(owner.profile.display_name) : null;

  return <>
    <ScrollView contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View className="items-center gap-3">
        <GroupAvatar name={group.name} size="xl" />
        <Text variant="h2" className="text-center">{group.name}</Text>
        <View className="flex-row flex-wrap items-center justify-center gap-2">
          <Text variant="callout" className="text-muted-foreground">{memberCountLabel(group.member_count)}</Text>
          {badge ? <Badge variant={badge === 'Archived' ? 'outline' : 'secondary'}><Text>{badge}</Text></Badge> : null}
        </View>
      </View>

      {group.description ? <Text selectable>{group.description}</Text> : null}

      <View className="gap-3">
        {action === 'join' ? <Button loading={busy} accessibilityLabel={`Join ${group.name}`} onPress={() => void change(joinGroup, groupJoinErrors)}>
          <Text>{busy ? 'Joining…' : 'Join group'}</Text>
        </Button> : action === 'leave' ? <Button variant="outline" loading={busy} accessibilityLabel={`Leave ${group.name}`} onPress={() => setConfirmLeave(true)}>
          <Text>{busy ? 'Leaving…' : 'Leave group'}</Text>
        </Button> : action === 'owner' ? <Text variant="callout" className="text-muted-foreground">
          {rolesSupported
            ? 'You own this group. To leave, first make an admin the owner from the member list.'
            : 'You own this group. Owners can’t leave their group yet.'}
        </Text> : null}
        {group.status === 'archived' ? <Text variant="callout" className="text-muted-foreground">
          This group is archived because it no longer has an owner. New members can’t join.
        </Text> : null}
        {error ? <Text variant="callout" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
        {refreshFailed && !error ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">
          Couldn’t refresh. This group may be out of date.
        </Text> : null}
      </View>

      {owner?.profile && ownerName ? <View className="gap-2">
        <Text variant="h4" accessibilityRole="header">Owner</Text>
        <IdentityRow
          name={ownerName}
          username={owner.profile.username?.trim() || 'student'}
          avatarUrl={owner.profile.avatar_url}
          onPress={() => openOwner(owner.user_id)}
        />
      </View> : null}

      <View className="border-t border-divider">
        <LinkRow
          icon={UsersRound}
          label="Members"
          value={group.member_count.toLocaleString('en-US')}
          accessibilityLabel={`View members. ${memberCountLabel(group.member_count)}`}
          onPress={openMembers}
        />
        {canEdit ? <LinkRow icon={Pencil} label="Edit group" accessibilityLabel="Edit the group name and description" onPress={openEdit} /> : null}
        {staff ? <LinkRow icon={Ban} label="Banned students" accessibilityLabel="View banned students" onPress={openBans} /> : null}
        {staff ? <LinkRow icon={History} label="Admin history" accessibilityLabel="View the administration history" onPress={openHistory} /> : null}
      </View>
    </ScrollView>
    <Dialog
      visible={confirmLeave}
      title="Leave this group?"
      description={group.status === 'archived'
        ? 'This group is archived, so you won’t be able to join it again.'
        : 'You can join it again later.'}
      onClose={() => setConfirmLeave(false)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setConfirmLeave(false)}><Text>Stay</Text></Button>
        <Button variant="destructive" size="sm" onPress={() => { setConfirmLeave(false); void change(leaveGroup, groupLeaveErrors); }}><Text>Leave</Text></Button>
      </>}
    />
  </>;
}

// One group: its initials tile, name, actual member count (never reduced by a
// block), description, owner (only when the viewer may see them; nothing stands in
// for an owner who is unavailable) and the single action that fits the viewer: Join,
// Leave, or an explanation for the owner or for an archived group. Staff also get
// rows leading to editing (owner only), the ban list and the administration
// history; members are managed from the member list. It reloads when it comes back
// into view. There are no group posts or chat.
export function GroupScreen({ groupId, userId }: { groupId: string | null; userId: string }) {
  const { state, reload, retry } = useGroupDetails(groupId);
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    void reload();
  }, [reload]));

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Group" onBack={goBack} />
    {state.status === 'ready' ? <Details key={state.details.group.id} details={state.details} userId={userId} refreshFailed={state.refreshFailed} reload={reload} />
      : state.status === 'failed' ? <StatePanel icon={WifiOff} title="Group couldn’t load"
        description="Check your connection and try again." live actionLabel="Try again" onAction={retry} />
        : state.status === 'missing' ? <StatePanel icon={UsersRound} title="Group not found"
          description="This group isn’t available." actionLabel="Go back" onAction={goBack} />
          : <DetailsSkeleton />}
  </SafeAreaView>;
}
