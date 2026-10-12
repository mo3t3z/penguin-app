import { Pressable } from 'react-native';
import { cn } from '@/lib/utils';
import { Text } from './text';

type ChipProps = Omit<React.ComponentProps<typeof Pressable>, 'children'> & { label: string; selected?: boolean };

// A choice in a short set: 36px high (hitSlop to 48), fully rounded, `input`
// outline. Selected chips fill with `foreground`.
export function Chip({ label, selected = false, className, ...props }: ChipProps) {
  return <Pressable
    className={cn(
      'h-9 items-center justify-center rounded-full border-1.5 px-4',
      selected ? 'border-foreground bg-foreground' : 'border-input active:bg-muted',
      className
    )}
    role="button"
    hitSlop={{ top: 6, bottom: 6 }}
    accessibilityLabel={label}
    {...props}
    accessibilityState={{ ...props.accessibilityState, selected }}
  >
    <Text className={cn('text-callout font-inter-medium', selected ? 'text-background' : 'text-foreground')}>{label}</Text>
  </Pressable>;
}
