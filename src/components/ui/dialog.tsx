import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { usePenguinTheme, ThemeScope } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { Text } from './text';

// A blocking question for an irreversible choice. Pass the actions with the safe
// one first and the destructive one last; they sit right-aligned under the text.
export function Dialog({ visible, title, description, actions, onClose }: {
  visible: boolean;
  title: string;
  description?: string;
  actions: ReactNode;
  onClose: () => void;
}) {
  const { scheme } = usePenguinTheme();
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}><ThemeScope>
    <View className="flex-1 items-center justify-center p-6">
      <Pressable className="absolute inset-0" style={{ backgroundColor: colors[scheme].overlay }} accessibilityLabel="Close" onPress={onClose} />
      <View className="w-full max-w-sm gap-3 rounded-lg bg-surface-raised p-6" style={shadowStyle('raised', scheme)} accessibilityViewIsModal role="alertdialog">
        <Text variant="h3">{title}</Text>
        {description ? <Text variant="callout" className="text-muted-foreground">{description}</Text> : null}
        <View className="flex-row flex-wrap justify-end gap-2 pt-2">{actions}</View>
      </View>
    </View>
  </ThemeScope></Modal>;
}
