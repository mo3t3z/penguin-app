import type { LucideIcon } from 'lucide-react-native';
import { colors, type ColorToken } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

export function Icon({ as: Glyph, size = 20, color = 'foreground', filled = false }: {
  as: LucideIcon; size?: 12 | 16 | 18 | 20 | 22 | 24 | 32 | 40; color?: ColorToken; filled?: boolean;
}) {
  const { scheme } = usePenguinTheme();
  const value = colors[scheme][color];
  return <Glyph size={size} strokeWidth={1.75} color={value} fill={filled ? value : 'none'} aria-hidden />;
}
