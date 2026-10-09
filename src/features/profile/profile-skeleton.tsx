import { View } from 'react-native';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FeedSkeleton } from '@/features/posts/feed-list';

// Figma "State · Loading profile": the profile skeleton card, the tab strip and
// one post skeleton.
export function ProfileSkeleton({ message }: { message: string }) {
  return <View className="gap-5 px-4 pt-4" accessibilityLabel="Loading profile" accessibilityState={{ busy: true }}>
    <Text variant="caption" className="px-1 text-muted-foreground">{message}</Text>
    <View className="gap-[18px] rounded-lg bg-card p-4">
      <View className="flex-row items-center gap-3">
        <Skeleton className="size-20 rounded-full" />
        <View className="gap-2"><Skeleton className="h-3 w-[134px] rounded-full" /><Skeleton className="h-2.5 w-[90px] rounded-full" /></View>
      </View>
      <Skeleton className="h-3 w-[88%] rounded-full" />
      <Skeleton className="h-3 w-[79%] rounded-full" />
      <Skeleton className="h-3 w-[58%] rounded-full" />
      <Skeleton className="h-12 w-[94%]" />
      <Skeleton className="h-12 w-[94%]" />
    </View>
    <View className="flex-row gap-1">
      <View className="h-0.5 flex-1 bg-primary" /><View className="h-0.5 flex-1 bg-border" />
    </View>
    <FeedSkeleton count={1} />
  </View>;
}
