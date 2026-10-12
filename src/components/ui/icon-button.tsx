import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import type { SolidColorToken } from '@/theme/tokens';
import { Icon } from './icon';

type IconButtonProps = Omit<React.ComponentProps<typeof Pressable>, 'children'> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  color?: SolidColorToken;
  // Muted fill: marks the button whose menu is open.
  tinted?: boolean;
};

// Icon-only control for headers and toolbars: a 48px circle (visual and touch
// target) with a 24px icon.
export function IconButton({ icon, color = 'foreground', tinted = false, className, disabled, ...props }: IconButtonProps) {
  return <Pressable
    className={cn('size-12 items-center justify-center rounded-full active:bg-muted', tinted && 'bg-muted', disabled && 'opacity-50', className)}
    role="button"
    {...props}
    disabled={disabled}
    accessibilityState={{ ...props.accessibilityState, disabled: Boolean(disabled) }}
  >
    <Icon as={icon} size={24} color={color} />
  </Pressable>;
}
