import { Image, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import type { SelectedPostImage } from './selected-media';

function PreviewImage({ image, index, count, className, disabled, onRemove }: {
  image: SelectedPostImage;
  index: number;
  count: number;
  className?: string;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const previewUri = image.processed?.uri ?? image.original.uri;
  return <View className={`relative overflow-hidden rounded-lg bg-muted ${className ?? ''}`}>
    <Image
      source={{ uri: previewUri }}
      className="h-full w-full"
      resizeMode="cover"
      accessibilityLabel={`Selected image ${index + 1} of ${count}`}
    />
    <Button
      variant="secondary"
      size="icon"
      className="absolute right-1 top-1 bg-card/90"
      accessibilityLabel={`Remove image ${index + 1} of ${count}`}
      disabled={disabled}
      onPress={() => onRemove(image.id)}
    >
      <Icon as={X} size={20} />
    </Button>
  </View>;
}

export function SelectedImagePreview({ images, disabled = false, onRemove }: {
  images: SelectedPostImage[];
  disabled?: boolean;
  onRemove: (id: string) => void;
}) {
  if (images.length === 0) return null;

  if (images.length === 1) {
    return <View style={{ aspectRatio: 4 / 3 }}>
      <PreviewImage image={images[0]} index={0} count={1} className="h-full w-full" disabled={disabled} onRemove={onRemove} />
    </View>;
  }

  if (images.length === 2) {
    return <View className="flex-row gap-1.5">
      {images.map((image, index) => <View key={image.id} className="flex-1" style={{ aspectRatio: 1 }}>
        <PreviewImage image={image} index={index} count={2} className="h-full w-full" disabled={disabled} onRemove={onRemove} />
      </View>)}
    </View>;
  }

  if (images.length === 3) {
    return <View className="flex-row gap-1.5" style={{ aspectRatio: 4 / 3 }}>
      <PreviewImage image={images[0]} index={0} count={3} className="h-full flex-1" disabled={disabled} onRemove={onRemove} />
      <View className="flex-1 gap-1.5">
        {images.slice(1).map((image, offset) => <PreviewImage key={image.id} image={image}
          index={offset + 1} count={3} className="flex-1" disabled={disabled} onRemove={onRemove} />)}
      </View>
    </View>;
  }

  return <View className="gap-1.5">
    {[images.slice(0, 2), images.slice(2, 4)].map((row, rowIndex) => <View key={rowIndex} className="flex-row gap-1.5">
      {row.map((image, columnIndex) => <View key={image.id} className="flex-1" style={{ aspectRatio: 1 }}>
        <PreviewImage image={image} index={rowIndex * 2 + columnIndex} count={4}
          className="h-full w-full" disabled={disabled} onRemove={onRemove} />
      </View>)}
    </View>)}
  </View>;
}
