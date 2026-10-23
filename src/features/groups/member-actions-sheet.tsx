import { Modal, Pressable, View } from 'react-native';
import { Ban, Crown, ShieldMinus, ShieldPlus, UserMinus, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePenguinTheme, ThemeScope } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { adminActionCopy, type GroupAdminAction } from './groups';

const icons: Record<GroupAdminAction, LucideIcon> = {
  promote: ShieldPlus, demote: ShieldMinus, transfer: Crown, remove: UserMinus, ban: Ban,
};

// What a staff member may do to one listed member, as a sheet from the bottom edge
// so every choice is within reach on a small phone. Choosing one only asks for
// confirmation; nothing happens from this sheet itself. Remove and Ban are separate
// rows with different words and icons.
export function MemberActionsSheet({ visible, name, actions, onChoose, onClose }: {
  visible: boolean;
  name: string;
  actions: readonly GroupAdminAction[];
  onChoose: (action: GroupAdminAction) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { scheme } = usePenguinTheme();
  return <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><ThemeScope>
    <View className="flex-1 justify-end">
      <Pressable className="absolute inset-0" style={{ backgroundColor: colors[scheme].overlay }} role="button" accessibilityLabel="Close" onPress={onClose} />
      <View
        className="w-full max-w-xl self-center rounded-t-lg bg-surface-raised px-2 pt-2"
        style={[shadowStyle('sheet', scheme), { paddingBottom: insets.bottom + 8 }]}
        accessibilityViewIsModal
      >
        <View className="mb-1 h-1 w-10 self-center rounded-full bg-border" aria-hidden />
        <Text variant="h4" numberOfLines={1} className="px-3 py-2" accessibilityRole="header">{name}</Text>
        {actions.map((action) => {
          const copy = adminActionCopy[action];
          const tone = copy.destructive ? 'destructive' : 'foreground';
          return <Pressable
            key={action}
            className="min-h-14 flex-row items-center gap-3 rounded-md px-3 active:bg-muted"
            role="button"
            accessibilityLabel={`${copy.label}: ${name}`}
            onPress={() => onChoose(action)}
          >
            <Icon as={icons[action]} size={24} color={tone} />
            <Text className={copy.destructive ? 'text-label text-destructive' : 'text-label'}>{copy.label}</Text>
          </Pressable>;
        })}
      </View>
    </View>
  </ThemeScope></Modal>;
}
