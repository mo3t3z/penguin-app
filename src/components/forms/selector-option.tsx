import { Pressable, View } from 'react-native';
import { Circle, CircleCheck, type LucideIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Figma "Selector option": icon, title, optional detail and a radio mark. The
// selected row gets the teal tint and border.
export function SelectorOption({ icon, title, detail, selected, disabled, onPress }: {
  icon: LucideIcon;
  title: string;
  detail?: string | null;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return <Pressable
    className={cn(
      'min-h-16 flex-row items-center gap-3 rounded-md border px-4 py-3',
      selected ? 'border-primary bg-accent' : 'border-border bg-card active:bg-muted',
      disabled && 'opacity-50',
    )}
    role="radio"
    disabled={disabled}
    accessibilityLabel={detail ? `${title}, ${detail}` : title}
    accessibilityState={{ selected, checked: selected, disabled: Boolean(disabled) }}
    onPress={onPress}
  >
    <Icon as={icon} size={22} color="primary" />
    <View className="min-w-0 flex-1">
      <Text variant="large">{title}</Text>
      {detail ? <Text variant="caption" className="text-muted-foreground">{detail}</Text> : null}
    </View>
    <Icon as={selected ? CircleCheck : Circle} size={22} color={selected ? 'primary' : 'muted-foreground'} />
  </Pressable>;
}
