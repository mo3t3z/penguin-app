import { memo, useEffect, useRef, useState } from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react-native';
import { Image, View, type ViewStyle } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { FeedMedia } from './feed';
import { orderReadyMedia } from './private-media';
import { usePrivateMediaUrl } from './use-private-media-url';

// Tile proportions of the image grid at 326px: one image is 326x206,
// two are 160x176 each, and three or four use 160x142 tiles (the third of three
// spans the full width).
const tileRatio = { single: 326 / 206, pair: 160 / 176, quad: 160 / 142, wide: 326 / 142 } as const;

function PrivatePostImage({ media, index, count, visible, style }: {
  media: FeedMedia;
  index: number;
  count: number;
  visible: boolean;
  style: ViewStyle;
}) {
  const { url, loading, error, refresh } = usePrivateMediaUrl(media.id, visible);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const automaticRetryUsed = useRef(false);
  const imageFailed = Boolean(url && failedUrl === url);

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

  return <View className="overflow-hidden rounded-md bg-muted" style={style}>
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
      : <View className="size-full items-center justify-center gap-1 px-3" accessible accessibilityLabel={`${label}. Image unavailable.`}>
        <Icon as={ImageIcon} size={24} color="muted-foreground" />
        <Text variant="caption" numberOfLines={2} className="text-center text-muted-foreground">{error ?? 'Image unavailable'}</Text>
        <Button variant="ghost" size="sm" onPress={retry} accessibilityLabel={`Retry loading image ${index + 1}`}>
          <Icon as={RefreshCw} size={16} color="primary-text" />
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
  const tile = (index: number, style: ViewStyle) => <PrivatePostImage
    key={ordered[index].id}
    media={ordered[index]}
    index={index}
    count={count}
    visible={visible}
    style={style}
  />;
  const half = (ratio: number): ViewStyle => ({ flex: 1, aspectRatio: ratio });
  return <View
    className="gap-1.5"
    accessibilityRole="summary"
    accessibilityLabel={`${count} image attachment${count === 1 ? '' : 's'}`}
  >
    {count === 1 ? tile(0, { width: '100%', aspectRatio: tileRatio.single }) : null}
    {count >= 2 ? <View className="flex-row gap-1.5">
      {tile(0, half(count === 2 ? tileRatio.pair : tileRatio.quad))}
      {tile(1, half(count === 2 ? tileRatio.pair : tileRatio.quad))}
    </View> : null}
    {count === 3 ? tile(2, { width: '100%', aspectRatio: tileRatio.wide }) : null}
    {count >= 4 ? <View className="flex-row gap-1.5">
      {tile(2, half(tileRatio.quad))}
      {tile(3, half(tileRatio.quad))}
    </View> : null}
  </View>;
}

export const PostMediaGrid = memo(PostMediaGridComponent);
