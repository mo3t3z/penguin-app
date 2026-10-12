import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { BrandMark } from '@/components/brand-mark';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Header: 56px below the top inset, 20px before the title (4px when it starts with
// Back) and 8px after the action. A title, or the wordmark on Home, and at most one
// action on the right. Pass brand={false} for a bar with only a back button, as on
// the auth screens.
export function TopBar({ title, onBack, actions, brand = true }: {
  title?: string;
  onBack?: () => void;
  actions?: ReactNode;
  brand?: boolean;
}) {
  return <View className={cn('h-14 flex-row items-center gap-1 pr-2', onBack ? 'pl-1' : 'pl-5')}>
    {onBack ? <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={onBack} /> : null}
    <View className="min-w-0 flex-1 flex-row items-center">
      {title
        ? <Text variant={onBack ? 'h4' : 'h2'} numberOfLines={1} className="shrink">{title}</Text>
        : brand ? <BrandMark /> : null}
    </View>
    {actions}
  </View>;
}
