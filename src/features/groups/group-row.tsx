import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { GroupRole } from '@/lib/database.types';
import { GroupAvatar } from './group-avatar';
import { groupBadge, groupRowLabel, memberCountLabel, type GroupSummary } from './groups';

// A group in a list: 48px initials tile, the name, one line of description when
// there is one, and the real member count. The badge says, in words, whether the
// viewer owns it, has joined it, or whether it is archived. The whole row opens
// the group.
function GroupRowComponent({ group, role, onOpen }: {
  group: GroupSummary;
  role: GroupRole | null;
  onOpen: (groupId: string) => void;
}) {
  const badge = groupBadge(group.status, role);
  return <Pressable
    className="min-h-18 flex-row items-center gap-3 px-5 py-3 active:bg-muted"
    role="button"
    accessibilityLabel={groupRowLabel(group, role)}
    onPress={() => onOpen(group.id)}
  >
    <GroupAvatar name={group.name} />
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <Text numberOfLines={1} className="shrink font-inter-semibold">{group.name}</Text>
        {badge ? <Badge variant={badge === 'Archived' ? 'outline' : 'secondary'}><Text>{badge}</Text></Badge> : null}
      </View>
      {group.description ? <Text variant="callout" numberOfLines={1} className="text-muted-foreground">{group.description}</Text> : null}
      <Text variant="caption" numberOfLines={1} className="text-muted-foreground">{memberCountLabel(group.member_count)}</Text>
    </View>
  </Pressable>;
}

export const GroupRow = memo(GroupRowComponent);

export function GroupRowsSkeleton({ label }: { label: string }) {
  return <View accessibilityLabel={label} accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5 py-3">
      <Skeleton className="size-12 rounded-md" />
      <View className="gap-2">
        <Skeleton className="h-3 w-36 rounded-full" />
        <Skeleton className="h-2.5 w-48 rounded-full" />
      </View>
    </View>)}
  </View>;
}
