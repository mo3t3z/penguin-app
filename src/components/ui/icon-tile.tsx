import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

// Figma symbol tile: a 92px rounded square with a 40px teal icon.
export function IconTile({ icon, tone = 'muted' }: { icon: LucideIcon; tone?: 'muted' | 'accent' }) {
  return <View className={cn('size-[92px] items-center justify-center rounded-xl', tone === 'accent' ? 'bg-accent' : 'bg-muted')}>
    <Icon as={icon} size={40} color="primary" />
  </View>;
}
