import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { usePenguinTheme, ThemeScope } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { Icon } from './icon';
import { Text } from './text';

export type MenuItem = {
  key: string; label: string; icon: LucideIcon; onPress: () => void;
  destructive?: boolean; busy?: boolean; disabled?: boolean;
};

// A short list of secondary actions under the icon button that opened it. `top` and
// `right` place it from the screen edges; tapping outside or Back closes it.
export function Menu({ visible, items, top, right = 8, onClose }: {
  visible: boolean;
  items: readonly MenuItem[];
  top: number;
  right?: number;
  onClose: () => void;
}) {
  const { scheme } = usePenguinTheme();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><ThemeScope>
    <Pressable className="absolute inset-0" accessibilityLabel="Close menu" onPress={onClose} />
    <View
      className="absolute w-56 rounded-lg border border-border bg-surface-raised p-1.5"
      style={[shadowStyle('raised', scheme), { top, right }]}
      accessibilityViewIsModal
      role="menu"
    >
      {items.map((item) => {
        const tone = item.destructive ? 'destructive' : 'foreground';
        return <Pressable
          key={item.key}
          className="h-12 flex-row items-center gap-3 rounded-md px-3 active:bg-muted"
          role="menuitem"
          disabled={item.disabled || item.busy}
          accessibilityLabel={item.label}
          accessibilityState={{ disabled: Boolean(item.disabled || item.busy), busy: Boolean(item.busy) }}
          onPress={item.onPress}
        >
          {item.busy
            ? <ActivityIndicator color={colors[scheme][tone]} accessibilityElementsHidden />
            : <Icon as={item.icon} color={tone} />}
          <Text className={item.destructive ? 'text-label text-destructive' : 'text-label'}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </ThemeScope></Modal>;
}
