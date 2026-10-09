import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { UserAvatar } from './user-avatar';

// Figma "Student identity row": 40px avatar, name over @username, with the
// publication time and optional trailing content on the right.
export function IdentityRow({ name, username, avatarUrl, time, timeAccessibilityLabel, trailing }: {
  name: string;
  username: string;
  avatarUrl?: string | null;
  time?: string;
  timeAccessibilityLabel?: string;
  trailing?: ReactNode;
}) {
  return <View className="flex-row items-center gap-[10px]">
    <UserAvatar name={name} uri={avatarUrl} size="md" />
    <View className="min-w-0 flex-1">
      <Text variant="large" numberOfLines={1}>{name}</Text>
      <Text variant="muted" numberOfLines={1}>@{username}</Text>
    </View>
    {time ? <Text className="text-micro text-muted-foreground" accessibilityLabel={timeAccessibilityLabel}>{time}</Text> : null}
    {trailing}
  </View>;
}
