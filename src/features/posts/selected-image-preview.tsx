import { Image, Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import type { SelectedPostImage } from './selected-media';

// The photos chosen for a post: 96px thumbnails that wrap two to a row on narrow
// phones, each with its own remove button (32px visual, hitSlop to 48).
export function SelectedImagePreview({ images, disabled = false, onRemove }: {
  images: SelectedPostImage[];
  disabled?: boolean;
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;
  return <View className="flex-row flex-wrap gap-2">
    {images.map((image, index) => <View key={image.id} className="size-24 overflow-hidden rounded-md bg-muted">
      <Image
        source={{ uri: image.processed?.uri ?? image.original.uri }}
        className="size-full"
        resizeMode="cover"
        accessibilityLabel={`Selected image ${index + 1} of ${images.length}`}
      />
      <Pressable
        className={cn('absolute right-1 top-1 size-8 items-center justify-center rounded-full bg-surface-raised active:bg-muted', disabled && 'opacity-50')}
        role="button"
        hitSlop={8}
        accessibilityLabel={`Remove image ${index + 1} of ${images.length}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onRemove(image.id)}
      >
        <Icon as={X} size={16} />
      </Pressable>
    </View>)}
  </View>;
}
