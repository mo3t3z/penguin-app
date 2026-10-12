import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { UserAvatar } from './user-avatar';

// Student identity row: 40px avatar, name over a meta line ("@username · 12m"),
// with optional trailing content on the right. With onPress the avatar and name
// open that student's profile.
export function IdentityRow({ name, username, avatarUrl, time, timeAccessibilityLabel, trailing, onPress }: {
  name: string;
  username: string;
  avatarUrl?: string | null;
  time?: string;
  timeAccessibilityLabel?: string;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const identity = <>
    <UserAvatar name={name} uri={avatarUrl} size="md" />
    <View className="min-w-0 flex-1">
      <Text variant="large" numberOfLines={1}>{name}</Text>
      <Text variant="muted" numberOfLines={1}>
        @{username}
        {time ? <Text variant="muted" accessibilityLabel={timeAccessibilityLabel}> · {time}</Text> : null}
      </Text>
    </View>
  </>;
  return <View className="flex-row items-center gap-3">
    {onPress
      ? <Pressable
        className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
        role="button"
        accessibilityLabel={`View ${name}’s profile${time ? `. ${timeAccessibilityLabel ?? time}` : ''}`}
        onPress={onPress}
      >{identity}</Pressable>
      : identity}
    {trailing}
  </View>;
}
