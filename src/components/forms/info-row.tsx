import { Pressable, View } from 'react-native';
import { Pencil, type LucideIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

// Figma "Profile information row": icon, small label and value. With onEdit the
// row becomes a button that jumps to the matching edit step.
export function InfoRow({ icon, label, value, onEdit, editLabel, editIcon = Pencil, disabled }: {
  icon: LucideIcon;
  label: string;
  value: string;
  onEdit?: () => void;
  editLabel?: string;
  editIcon?: LucideIcon;
  disabled?: boolean;
}) {
  const content = <>
    <Icon as={icon} size={22} color="primary" />
    <View className="min-w-0 flex-1">
      <Text variant="caption" className="text-muted-foreground">{label}</Text>
      <Text className="font-inter-medium">{value}</Text>
    </View>
    {onEdit ? <Icon as={editIcon} size={editIcon === Pencil ? 16 : 20} color="muted-foreground" /> : null}
  </>;
  if (!onEdit) return <View className="min-h-12 flex-row items-center gap-3">{content}</View>;
  return <Pressable
    className="min-h-12 flex-row items-center gap-3 active:opacity-70"
    role="button"
    disabled={disabled}
    accessibilityLabel={`${label}: ${value}. ${editLabel ?? `Edit ${label.toLowerCase()}`}`}
    onPress={onEdit}
  >{content}</Pressable>;
}
