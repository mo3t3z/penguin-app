import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { SearchSelection, type Selection } from '@/features/onboarding/search-selection';

type SelectorSheetProps = {
  kind: 'institution' | 'field';
  visible: boolean;
  selected: Selection | null;
  onConfirm: (value: Selection) => void;
  onClose: () => void;
};

// Mounted only while the sheet is open, so the temporary choice always starts from
// the saved one and is discarded when the sheet closes without confirming.
function SheetContent({ kind, selected, onConfirm, onClose }: Omit<SelectorSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(selected);
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
        <Text variant="h3" className="text-[20px] leading-[26px]">{kind === 'institution' ? 'Your institution' : 'Field of study'}</Text>
        <IconButton icon={X} className="bg-transparent" accessibilityLabel="Close without changing" onPress={onClose} />
      </View>
      <ScrollView className="shrink" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-1">
        <SearchSelection kind={kind} selected={pending} onSelect={setPending} />
      </ScrollView>
      <Button disabled={!pending} onPress={() => { if (pending) onConfirm(pending); }}>
        <Text>Confirm selection</Text>
      </Button>
    </View>
  </KeyboardAvoidingView>;
}

// Figma "Modal / bottom sheet" with the searchable institution or field list.
export function SelectorSheet({ visible, ...content }: SelectorSheetProps) {
  return <Modal
    visible={visible}
    transparent
    animationType="fade"
    statusBarTranslucent
    navigationBarTranslucent
    onRequestClose={content.onClose}
  >
    {visible ? <SheetContent {...content} /> : null}
  </Modal>;
}
