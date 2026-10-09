import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';

function SheetBody({ title, confirmDisabled, onConfirm, onClose, children }: PropsWithChildren<{
  title: string; confirmDisabled: boolean; onConfirm: () => void; onClose: () => void;
}>) {
  const insets = useSafeAreaInsets();
  // The modal window does not resize for the keyboard, so pad on both platforms.
  return <KeyboardAvoidingView className="flex-1 justify-end" behavior="padding">
    <Pressable className="absolute inset-0 bg-black/40" accessibilityLabel="Close without changing" onPress={onClose} />
    <View
      className="max-h-[88%] gap-4 rounded-t-xl bg-background px-5 pt-3"
      style={{ paddingBottom: insets.bottom + 16 }}
      accessibilityViewIsModal
    >
      <View className="h-1 w-10 self-center rounded-full bg-border" />
      <View className="flex-row items-center justify-between">
        <Text variant="h3" className="text-[20px] leading-[26px]">{title}</Text>
        <IconButton icon={X} className="bg-transparent" accessibilityLabel="Close without changing" onPress={onClose} />
      </View>
      <ScrollView className="shrink" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-1">
        {children}
      </ScrollView>
      <Button disabled={confirmDisabled} onPress={onConfirm}>
        <Text>Confirm selection</Text>
      </Button>
    </View>
  </KeyboardAvoidingView>;
}

// Figma "Modal / bottom sheet": handle, title, close, scrolling content and a
// confirm button. Callers mount it only while open and keep the temporary choice
// in their own state, so closing without confirming discards it.
export function SheetShell({ visible, title, confirmDisabled, onConfirm, onClose, children }: {
  visible: boolean;
  title: string;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return <Modal
    visible={visible}
    transparent
    animationType="fade"
    statusBarTranslucent
    navigationBarTranslucent
    onRequestClose={onClose}
  >
    {visible ? <SheetBody title={title} confirmDisabled={confirmDisabled} onConfirm={onConfirm} onClose={onClose}>
      {children}
    </SheetBody> : null}
  </Modal>;
}
