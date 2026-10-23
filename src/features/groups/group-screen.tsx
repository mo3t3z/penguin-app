import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ban, CalendarDays, Camera, ChevronRight, FileText, History, Info, MessagesSquare, Pencil, UserPlus, UsersRound, WifiOff, type LucideIcon } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedTabs } from '@/components/navigation/segmented-tabs';
import { TopBar } from '@/components/navigation/top-bar';
import { IdentityRow } from '@/components/social/identity-row';
import { StatePanel } from '@/components/social/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { pickAndUploadPhoto } from '@/features/profile/photo-service';
import { profileDisplayName } from '@/features/profile/profile-format';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { GroupAvatar } from './group-avatar';
import { groupAction, groupBadge, groupErrorKind, groupJoinErrors, groupLeaveErrors, isGroupStaff, memberCountLabel } from './groups';
import { joinGroup, leaveGroup, setGroupCover, type GroupDetails } from './service';
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

const tabs = [
  { key: 'posts', label: 'Posts', icon: FileText },
  { key: 'about', label: 'About', icon: Info },
  { key: 'members', label: 'Members', icon: UsersRound },
] as const;
type GroupTab = typeof tabs[number]['key'];

function createdLabel(createdAt: string) {
  const at = Date.parse(createdAt);
  return Number.isFinite(at) ? `Created ${new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(at)}` : null;
}

// The cover: the group's image, or its initials on a quiet tint. The owner of an
// active group can change it.
function GroupCover({ group, userId, canEdit, onChanged }: {
  group: GroupDetails['group']; userId: string; canEdit: boolean; onChanged: () => Promise<void>;
}) {
  const { scheme } = usePenguinTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function change() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const url = await pickAndUploadPhoto(userId, 'group-cover');
      if (url) { await setGroupCover(group.id, url); await onChanged(); }
    } catch { setError('Penguin couldn’t update the cover. Check your connection and try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <View className="gap-1 px-5 pt-2">
    <View className="aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-accent">
      {group.cover_url ? <Image source={{ uri: group.cover_url }} className="absolute inset-0" resizeMode="cover"
        accessibilityIgnoresInvertColors aria-hidden /> : <GroupAvatar name={group.name} size="xl" />}
      {canEdit ? <Pressable className="absolute bottom-2 right-2 flex-row items-center gap-1.5 rounded-sm bg-background/80 px-3 py-1.5"
        role="button" accessibilityLabel="Change the group cover" disabled={busy} onPress={() => void change()}>
        {busy ? <ActivityIndicator size="small" color={colors[scheme].foreground} /> : <Icon as={Camera} size={16} />}
        <Text className="font-inter-medium text-footnote">Edit cover</Text>
      </Pressable> : null}
    </View>
    {error ? <Text variant="caption" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
  </View>;
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
  const [tab, setTab] = useState<GroupTab>('about');
  const created = createdLabel(group.created_at);

  return <>
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <GroupCover group={group} userId={userId} canEdit={canEdit} onChanged={reload} />

      <View className="gap-3 px-5 pt-4">
        <Text variant="h1" className="font-inter-bold">{group.name}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Icon as={UsersRound} size={16} color="muted-foreground" />
          <Text variant="callout" className="text-muted-foreground">Public group · {memberCountLabel(group.member_count)}</Text>
          {badge ? <Badge variant={badge === 'Archived' ? 'outline' : 'secondary'}><Text>{badge}</Text></Badge> : null}
        </View>
        {group.description ? <Text selectable>{group.description}</Text> : null}

        <View className="gap-3 pt-1">
          {action === 'join' ? <Button className="rounded-full" loading={busy} accessibilityLabel={`Join ${group.name}`} onPress={() => void change(joinGroup, groupJoinErrors)}>
            {busy ? null : <Icon as={UserPlus} size={20} color="background" />}
            <Text>{busy ? 'Joining…' : 'Join group'}</Text>
          </Button> : action === 'leave' ? <Button variant="outline" className="rounded-full" loading={busy} accessibilityLabel={`Leave ${group.name}`} onPress={() => setConfirmLeave(true)}>
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
      </View>

      <View className="pt-4">
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      </View>

      {tab === 'posts' ? <StatePanel icon={MessagesSquare} title="No group posts yet"
        description="Posting inside groups isn’t available yet. For now, share in your feed." />
        : tab === 'about' ? <View className="gap-5 px-5 pt-5">
          {group.description ? <View className="gap-1.5">
            <Text variant="h4" accessibilityRole="header">Description</Text>
            <Text selectable className="text-muted-foreground">{group.description}</Text>
          </View> : null}
          {created ? <View className="flex-row items-center gap-2">
            <Icon as={CalendarDays} size={16} color="muted-foreground" />
            <Text variant="callout" className="text-muted-foreground">{created}</Text>
          </View> : null}
          {owner?.profile && ownerName ? <View className="gap-2">
            <Text variant="h4" accessibilityRole="header">Owner</Text>
            <IdentityRow
              name={ownerName}
              username={owner.profile.username?.trim() || 'student'}
              avatarUrl={owner.profile.avatar_url}
              onPress={() => openOwner(owner.user_id)}
            />
          </View> : null}
        </View>
          : <View className="px-5">
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
          </View>}
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

// One group: its cover (the owner can change it), name, actual member count (never
// reduced by a block), description and the single action that fits the viewer:
// Join, Leave, or an explanation for the owner or for an archived group. Then three
// tabs: Posts (not available yet), About (description, creation month and the owner,
// only when the viewer may see them; nothing stands in for an owner who is
// unavailable) and Members, with the rows staff use for editing (owner only), the
// ban list and the administration history. It reloads when it comes back into view.
// There are no group posts or chat yet.
export function GroupScreen({ groupId, userId }: { groupId: string | null; userId: string }) {
  const { state, reload, retry } = useGroupDetails(groupId);
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!focusedOnce.current) { focusedOnce.current = true; return; }
    void reload();
  }, [reload]));

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Group details" onBack={goBack} />
    {state.status === 'ready' ? <Details key={state.details.group.id} details={state.details} userId={userId} refreshFailed={state.refreshFailed} reload={reload} />
      : state.status === 'failed' ? <StatePanel icon={WifiOff} title="Group couldn’t load"
        description="Check your connection and try again." live actionLabel="Try again" onAction={retry} />
        : state.status === 'missing' ? <StatePanel icon={UsersRound} title="Group not found"
          description="This group isn’t available." actionLabel="Go back" onAction={goBack} />
          : <DetailsSkeleton />}
  </SafeAreaView>;
}
