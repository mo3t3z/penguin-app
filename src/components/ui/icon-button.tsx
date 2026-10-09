import type { LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import type { ColorToken } from '@/theme/tokens';
import { Icon } from './icon';

type IconButtonProps = Omit<React.ComponentProps<typeof Pressable>, 'children'> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  color?: ColorToken;
};

// Figma "Icon button": 44px card-coloured square with 12px corners and a 22px icon.
// hitSlop extends the touch target to 48px.
export function IconButton({ icon, color = 'foreground', className, disabled, ...props }: IconButtonProps) {
  return <Pressable
    className={cn('size-11 items-center justify-center rounded-md bg-card active:bg-accent', disabled && 'opacity-50', className)}
    role="button"
    hitSlop={2}
    {...props}
    disabled={disabled}
    accessibilityState={{ ...props.accessibilityState, disabled: Boolean(disabled) }}
  >
    <Icon as={icon} size={22} color={color} />
  </Pressable>;
}
