import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Images, WifiOff } from 'lucide-react-native';
import { StatePanel } from '@/components/social/state-panel';
import { Skeleton } from '@/components/ui/skeleton';
import { getProfileMedia, type ProfileMediaItem } from '@/features/posts/service';
import { usePrivateMediaUrl } from '@/features/posts/use-private-media-url';

function Tile({ item }: { item: ProfileMediaItem }) {
  const { url } = usePrivateMediaUrl(item.id, true);
  return <Pressable className="aspect-square w-1/3 p-0.5" accessibilityRole="imagebutton" accessibilityLabel="Open post"
    onPress={() => router.push({ pathname: '/comments/[postId]', params: { postId: item.postId } })}>
    {url ? <Image source={{ uri: url }} className="flex-1 rounded-sm bg-muted" resizeMode="cover" accessibilityIgnoresInvertColors />
      : <Skeleton className="flex-1 rounded-sm" />}
  </Pressable>;
}

// A student's photos, three to a row, newest post first. Tapping one opens its post.
export function ProfileMediaGrid({ authorId, own }: { authorId: string; own: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; items: ProfileMediaItem[] | null } | null>(null);
  const key = `${authorId}:${attempt}`;
  useEffect(() => {
    let active = true;
    void getProfileMedia(authorId).then(items => { if (active) setResult({ key, items }); })
      .catch(() => { if (active) setResult({ key, items: null }); });
    return () => { active = false; };
  }, [authorId, key]);
  if (result?.key !== key) return <View className="flex-row flex-wrap px-3 pt-3" accessibilityLabel="Loading photos" accessibilityState={{ busy: true }}>
    {Array.from({ length: 6 }, (_, index) => <View key={index} className="aspect-square w-1/3 p-0.5"><Skeleton className="flex-1 rounded-sm" /></View>)}
  </View>;
  if (!result.items) return <StatePanel icon={WifiOff} title="Photos couldn’t load" description="Check your connection and try again."
    live actionLabel="Try again" onAction={() => setAttempt(value => value + 1)} />;
  if (!result.items.length) return <StatePanel icon={Images} title="No photos yet"
    description={own ? 'Photos you share in posts appear here.' : 'Photos shared in posts appear here.'} />;
  return <View className="flex-row flex-wrap px-3 pt-3">{result.items.map(item => <Tile key={item.id} item={item} />)}</View>;
}
