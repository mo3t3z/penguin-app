import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { usePenguinTheme } from '@/theme/provider';
import { shadowStyle } from '@/theme/shadow';
import { Icon } from './icon';
import { Text } from './text';

const TOAST_DURATION = 4000;
const tones = {
  neutral: { surface: 'bg-surface-raised', text: 'text-foreground', icon: 'foreground' },
  success: { surface: 'bg-success-surface', text: 'text-success', icon: 'success' },
  error: { surface: 'bg-destructive-surface', text: 'text-destructive', icon: 'destructive' },
} as const;

// A short result message. The caller places it (above the navigation) and shows one
// at a time. It leaves after 4 seconds, except while a screen reader is on: then it
// stays until dismissed, so it is never missed. Never the only place an error appears.
export function Toast({ message, icon, tone = 'neutral', actionLabel, onAction, onDismiss }: {
  message: string;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((reading) => {
      if (!cancelled && !reading) timer = setTimeout(onDismiss, TOAST_DURATION);
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [message, onDismiss]);
  const { scheme } = usePenguinTheme();
  const palette = tones[tone];
  return <View
    className={cn('min-h-12 flex-row items-center gap-3 rounded-lg px-4 py-3', palette.surface)}
    style={shadowStyle('raised', scheme)}
    accessibilityLiveRegion="polite"
    role="status"
  >
    <Icon as={icon} color={palette.icon} />
    <Text variant="callout" className={cn('flex-1', palette.text)}>{message}</Text>
    {actionLabel && onAction ? <Pressable className="h-10 justify-center px-2" role="button" hitSlop={4} accessibilityLabel={actionLabel} onPress={onAction}>
      <Text className={cn('text-label font-inter-semibold', palette.text)}>{actionLabel}</Text>
    </Pressable> : null}
  </View>;
}
