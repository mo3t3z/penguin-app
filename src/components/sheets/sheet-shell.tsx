import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';

type SheetProps = {
  title: string;
  // The footer action. Leave `onConfirm` out for a sheet without one.
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
};

function SheetBody({ title, confirmLabel = 'Confirm selection', confirmDisabled, onConfirm, onClose, children }: PropsWithChildren<SheetProps>) {
  const insets = useSafeAreaInsets();
  const { scheme } = usePenguinTheme();
  // The modal window does not resize for the keyboard, so pad on both platforms.
  return <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding">
    <Pressable className="absolute inset-0" style={{ backgroundColor: colors[scheme].overlay }} accessibilityLabel="Close without changing" onPress={onClose} />
    <View
      className="max-h-[88%] w-full max-w-xl self-center rounded-t-lg bg-surface-raised"
      style={[shadowStyle('sheet', scheme), { paddingBottom: insets.bottom + 16 }]}
      accessibilityViewIsModal
    >
      <View className="mt-2 h-1 w-10 self-center rounded-full bg-border" />
      <View className="h-14 flex-row items-center gap-2 pl-3 pr-2">
        <View className="size-12" />
        <Text className="flex-1 text-center text-body font-inter-semibold" numberOfLines={1} role="heading">{title}</Text>
        <IconButton icon={X} accessibilityLabel="Close without changing" onPress={onClose} />
      </View>
      <ScrollView className="shrink" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="px-5 pb-4">
        {children}
      </ScrollView>
      {onConfirm ? <Button className="mx-5" disabled={confirmDisabled} onPress={onConfirm}>
        <Text>{confirmLabel}</Text>
      </Button> : null}
    </View>
  </KeyboardAvoidingView>;
}

// BottomSheet: handle, centred title, close, scrolling content and an optional
// footer action on a raised surface over the scrim. Callers mount it only while
// open and keep the temporary choice in their own state, so closing without
// confirming discards it.
export function SheetShell({ visible, children, ...sheet }: PropsWithChildren<SheetProps & { visible: boolean }>) {
  return <Modal
    visible={visible}
    transparent
    animationType="fade"
    statusBarTranslucent
    navigationBarTranslucent
    onRequestClose={sheet.onClose}
  >
    {visible ? <SheetBody {...sheet}>{children}</SheetBody> : null}
  </Modal>;
}
