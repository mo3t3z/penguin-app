import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

// Figma "Empty state" and "Error state" share one layout: a 92px Ice tile with a
// teal icon, a bold title, supporting text and one primary action.
export function StatePanel({ icon, title, description, actionLabel, onAction, footnote, live = false, children }: {
  icon: LucideIcon;
  title: string;
  description?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  footnote?: string;
  live?: boolean;
  children?: ReactNode;
}) {
  return <View className="items-center gap-5 px-4 py-10">
    <View className="size-[92px] items-center justify-center rounded-xl bg-muted">
      <Icon as={icon} size={40} color="primary" />
    </View>
    <View className="items-center gap-3">
      <Text variant="h3" className="text-center">{title}</Text>
      {description ? <Text
        className="text-center text-muted-foreground"
        accessibilityLiveRegion={live ? 'polite' : 'none'}
      >{description}</Text> : null}
    </View>
    {actionLabel && onAction ? <Button className="self-stretch" onPress={onAction}>
      <Text>{actionLabel}</Text>
    </Button> : null}
    {children}
    {footnote ? <Text variant="caption" className="text-center text-muted-foreground">{footnote}</Text> : null}
  </View>;
}
