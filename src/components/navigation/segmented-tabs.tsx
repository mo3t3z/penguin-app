import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Figma "Tabs": equal-width labels over a 2px indicator, teal for the active tab.
export function SegmentedTabs<Key extends string>({ tabs, value, onChange }: {
  tabs: readonly { key: Key; label: string }[];
  value: Key;
  onChange: (key: Key) => void;
}) {
  return <View className="flex-row gap-1" accessibilityRole="tablist">
    {tabs.map((tab) => {
      const selected = tab.key === value;
      return <Pressable
        key={tab.key}
        className="min-h-11 flex-1 items-center justify-between pt-[10px]"
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
        onPress={() => { if (!selected) onChange(tab.key); }}
      >
        <Text className={cn('text-caption', selected ? 'font-inter-semibold text-primary' : 'font-inter-medium text-muted-foreground')}>
          {tab.label}
        </Text>
        <View className={cn('h-0.5 w-full', selected ? 'bg-primary' : 'bg-border')} />
      </Pressable>;
    })}
  </View>;
}
