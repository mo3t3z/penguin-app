import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';

// EmptyState: explains an empty, idle or failed region and offers one next step.
// The button is an outline unless it is the screen's main action (`primaryAction`).
export function StatePanel({ icon, title, description, actionLabel, onAction, primaryAction = false, footnote, live = false, children }: {
  icon: LucideIcon;
  title: string;
  description?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  primaryAction?: boolean;
  footnote?: string;
  live?: boolean;
  children?: ReactNode;
}) {
  return <View className="items-center gap-3 px-6 py-8">
    <IconTile icon={icon} />
    <Text variant="h3" className="text-center">{title}</Text>
    {description ? <Text
      variant="callout"
      className="max-w-xs text-center text-muted-foreground"
      accessibilityLiveRegion={live ? 'polite' : 'none'}
    >{description}</Text> : null}
    {actionLabel && onAction ? <Button variant={primaryAction ? 'default' : 'outline'} className="mt-1" onPress={onAction}>
      <Text>{actionLabel}</Text>
    </Button> : null}
    {children}
    {footnote ? <Text variant="caption" className="text-center text-muted-foreground">{footnote}</Text> : null}
  </View>;
}
