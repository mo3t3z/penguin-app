import { Pressable, View } from 'react-native';
import { Link } from 'expo-router';
import { ImageIcon } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

// Quick composer: both controls open the real Create post screen, which supports
// text and images. PDF and poll shortcuts are left out until those post types exist.
export function FeedComposer({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const firstName = name.split(/\s+/)[0];
  return <View className="flex-row items-center gap-[10px]">
    <UserAvatar name={name} uri={avatarUrl} size="md" />
    <View className="min-h-12 flex-1 flex-row items-center rounded-full border border-border bg-card pl-4 pr-1">
      <Link href="/create-post" asChild>
        <Pressable
          className="min-h-12 flex-1 justify-center active:opacity-70"
          role="button"
          accessibilityLabel="Create a post"
        >
          <Text variant="muted" numberOfLines={1}>What’s on your mind, {firstName}?</Text>
        </Pressable>
      </Link>
      <Link href="/create-post" asChild>
        <Pressable
          className="size-11 items-center justify-center rounded-full active:bg-accent"
          role="button"
          hitSlop={2}
          accessibilityLabel="Create a post with photos"
        >
          <Icon as={ImageIcon} size={24} color="muted-foreground" />
        </Pressable>
      </Link>
    </View>
  </View>;
}
