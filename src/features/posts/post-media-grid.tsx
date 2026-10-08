import { memo, useEffect, useRef, useState } from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react-native';
import { Image, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { FeedMedia } from './feed';
import { orderReadyMedia } from './private-media';
import { usePrivateMediaUrl } from './use-private-media-url';

function PrivatePostImage({ media, index, count, visible }: {
  media: FeedMedia;
  index: number;
  count: number;
  visible: boolean;
}) {
  const { url, loading, error, refresh } = usePrivateMediaUrl(media.id, visible);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const automaticRetryUsed = useRef(false);
  const imageFailed = Boolean(url && failedUrl === url);
  const width = count === 1 || (count === 3 && index === 0) ? '100%' : '48.5%';
  const aspectRatio = count === 1 && media.width && media.height
    ? Math.min(1.6, Math.max(0.8, media.width / media.height))
    : count === 3 && index === 0 ? 16 / 10 : 1;

  useEffect(() => {
    if (!visible) automaticRetryUsed.current = false;
  }, [visible]);

  const retry = () => {
    automaticRetryUsed.current = false;
    setFailedUrl(null);
    refresh();
  };
  const handleImageError = () => {
    if (!url) return;
    if (!automaticRetryUsed.current) {
      automaticRetryUsed.current = true;
      refresh();
      return;
    }
    setFailedUrl(url);
  };
  const label = `Image ${index + 1} of ${count} in this post`;

  return <View
    className="min-h-36 overflow-hidden rounded-md border border-border bg-muted"
    style={{ width, aspectRatio }}
  >
    {url && !imageFailed ? <Image
      source={{ uri: url }}
      className="size-full"
      resizeMode="cover"
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onError={handleImageError}
      onLoad={() => {
        automaticRetryUsed.current = false;
        setFailedUrl(null);
      }}
    /> : loading ? <Skeleton className="size-full rounded-none" accessibilityLabel={`Loading ${label.toLowerCase()}`} />
      : <View className="size-full items-center justify-center gap-2 px-3" accessible accessibilityLabel={`${label}. Image unavailable.`}>
        <Icon as={ImageIcon} size={32} color="muted-foreground" />
        <Text variant="caption" className="text-center text-muted-foreground">{error ?? 'Image unavailable'}</Text>
        <Button variant="ghost" size="sm" onPress={retry} accessibilityLabel={`Retry loading image ${index + 1}`}>
          <Icon as={RefreshCw} size={16} color="foreground" />
          <Text>Retry</Text>
        </Button>
      </View>}
    {loading && url ? <View className="absolute inset-x-0 bottom-0 h-1 bg-primary/60" accessibilityLabel={`Refreshing ${label.toLowerCase()}`} /> : null}
  </View>;
}

function PostMediaGridComponent({ media, visible }: { media: FeedMedia[]; visible: boolean }) {
  const ordered = orderReadyMedia(media);
  const count = ordered.length;
  if (!count) return null;
  return <View
    className="flex-row flex-wrap gap-2"
    accessibilityRole="summary"
    accessibilityLabel={`${count} image attachment${count === 1 ? '' : 's'}`}
  >
    {ordered.map((item, index) => <PrivatePostImage
      key={item.id}
      media={item}
      index={index}
      count={count}
      visible={visible}
    />)}
  </View>;
}

export const PostMediaGrid = memo(PostMediaGridComponent);
