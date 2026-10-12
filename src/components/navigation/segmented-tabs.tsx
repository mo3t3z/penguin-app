import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Equal-width text tabs that switch views in place: 44px high over a divider, the
// selected one in `foreground` at weight 600 with a 2px `primary` underline.
export function SegmentedTabs<Key extends string>({ tabs, value, onChange }: {
  tabs: readonly { key: Key; label: string }[];
  value: Key;
  onChange: (key: Key) => void;
}) {
  return <View className="flex-row border-b border-divider" accessibilityRole="tablist">
    {tabs.map((tab) => {
      const selected = tab.key === value;
      return <Pressable
        key={tab.key}
        className="min-h-11 flex-1 items-center justify-center"
        hitSlop={{ top: 2, bottom: 2 }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
        onPress={() => { if (!selected) onChange(tab.key); }}
      >
        <Text className={cn('text-label', selected ? 'font-inter-semibold text-foreground' : 'text-muted-foreground')}>
          {tab.label}
        </Text>
        {selected ? <View className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" /> : null}
      </Pressable>;
    })}
  </View>;
}
