import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { BrandMark } from '@/components/brand-mark';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';

// Figma "Top navigation": 60px tall, 16px inset, optional back button, a title or
// the brand mark, and trailing actions.
export function TopBar({ title, onBack, actions }: {
  title?: string;
  onBack?: () => void;
  actions?: ReactNode;
}) {
  return <View className="h-[60px] flex-row items-center gap-2 px-4">
    {onBack ? <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={onBack} /> : null}
    <View className="min-w-0 flex-1 flex-row items-center">
      {title
        ? <Text variant="h4" numberOfLines={1} className="shrink">{title}</Text>
        : <BrandMark />}
    </View>
    {actions}
  </View>;
}
