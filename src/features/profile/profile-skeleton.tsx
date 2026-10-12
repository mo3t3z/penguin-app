import { View } from 'react-native';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FeedSkeleton } from '@/features/posts/feed-list';

// A profile while it loads: the centred identity block, the tab strip and one post,
// each with its final geometry.
export function ProfileSkeleton({ message }: { message: string }) {
  return <View accessibilityLabel="Loading profile" accessibilityState={{ busy: true }}>
    <Text variant="caption" className="px-5 text-center text-muted-foreground">{message}</Text>
    <View className="items-center gap-3 px-6 pb-6 pt-4">
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-5 w-40 rounded-full" />
      <Skeleton className="h-3 w-24 rounded-full" />
      <Skeleton className="h-3 w-56 rounded-full" />
      <Skeleton className="h-3 w-[79%] rounded-full" />
      <Skeleton className="h-12 w-full" />
    </View>
    <View className="h-11 border-b border-divider" />
    <FeedSkeleton count={1} />
  </View>;
}
