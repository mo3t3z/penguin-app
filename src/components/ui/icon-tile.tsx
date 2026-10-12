import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

// The one decorative icon of an empty, idle or failed state: 32px in a 72px circle.
export function IconTile({ icon, tone = 'muted' }: { icon: LucideIcon; tone?: 'muted' | 'accent' }) {
  return <View className={cn('size-18 items-center justify-center rounded-full', tone === 'accent' ? 'bg-accent' : 'bg-muted')}>
    <Icon as={icon} size={32} color={tone === 'accent' ? 'accent-foreground' : 'foreground'} />
  </View>;
}
