import { useState } from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { SelectorOption } from '@/components/forms/selector-option';
import { SheetShell } from './sheet-shell';

type OptionSheetProps<Value extends string> = {
  visible: boolean;
  title: string;
  icon: LucideIcon;
  options: readonly { value: Value; label: string }[];
  selected: Value | null;
  onConfirm: (value: Value) => void;
  onClose: () => void;
};

function OpenOptionSheet<Value extends string>({ title, icon, options, selected, onConfirm, onClose }: Omit<OptionSheetProps<Value>, 'visible'>) {
  const [pending, setPending] = useState(selected);
  return <SheetShell
    visible
    title={title}
    confirmDisabled={!pending}
    onConfirm={() => { if (pending) onConfirm(pending); }}
    onClose={onClose}
  >
    <View className="gap-3" accessibilityRole="radiogroup">
      {options.map((option) => <SelectorOption key={option.value} icon={icon} title={option.label}
        selected={pending === option.value} onPress={() => setPending(option.value)} />)}
    </View>
  </SheetShell>;
}

// A short fixed list of choices in the Figma bottom sheet (for example study
// level). Closing without confirming discards the temporary choice.
export function OptionSheet<Value extends string>({ visible, ...content }: OptionSheetProps<Value>) {
  return visible ? <OpenOptionSheet {...content} /> : null;
}
