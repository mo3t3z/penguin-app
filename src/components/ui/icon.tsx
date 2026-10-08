import type { LucideIcon } from 'lucide-react-native';
import { colors, type ColorToken } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

export function Icon({ as: Glyph, size = 20, color = 'foreground' }: {
  as: LucideIcon; size?: 16 | 20 | 24 | 32; color?: ColorToken;
}) {
  const { scheme } = usePenguinTheme();
  return <Glyph size={size} strokeWidth={1.75} color={colors[scheme][color]} aria-hidden />;
}

