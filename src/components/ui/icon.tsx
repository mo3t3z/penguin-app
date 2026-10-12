import type { LucideIcon } from 'lucide-react-native';
import { colors, type SolidColorToken } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

// Lucide on a 24px grid, stroke 1.75 at every size: 16 meta, 20 post actions and
// fields, 24 navigation, headers and toolbars, 32 empty states. Outline by default;
// `filled` is for the active navigation item and a liked heart only.
export function Icon({ as: Glyph, size = 20, color = 'foreground', filled = false, fillColor, strokeWidth = 1.75 }: {
  as: LucideIcon; size?: 12 | 16 | 20 | 24 | 32; color?: SolidColorToken; filled?: boolean;
  fillColor?: SolidColorToken; strokeWidth?: 1.75 | 2.25;
}) {
  const { scheme } = usePenguinTheme();
  const value = colors[scheme][color];
  return <Glyph size={size} strokeWidth={strokeWidth} color={value} fill={filled ? colors[scheme][fillColor ?? color] : 'none'} aria-hidden />;
}
