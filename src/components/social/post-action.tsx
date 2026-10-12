import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/lib/use-reduce-motion';
import { cn } from '@/lib/utils';
import { motion } from '@/theme/tokens';

// 44px high and at least 48px wide; the vertical hitSlop gives a 48px touch target.
const actionHitSlop = { top: 2, bottom: 2 };

type PostActionProps = Omit<React.ComponentProps<typeof Pressable>, 'children'> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  // Count or short word shown beside the icon.
  label?: string | number;
  // Filled icon (`primary` fill, `primary-text` stroke) and a `primary-text` count: liked.
  active?: boolean;
  // The icon gives one short pop when the action turns active (a like landing).
  pop?: boolean;
};

const POP_SCALE = 1.25;

// Confirms the tap at the moment the like registers, before the count changes. It
// plays only on the change to active, never on first render or when a liked post
// scrolls into view, and not at all with reduce motion.
function PopOnActive({ active, children }: { active: boolean; children: React.ReactNode }) {
  const reduceMotion = useReduceMotion();
  const scale = useState(() => new Animated.Value(1))[0];
  const wasActive = useRef(active);
  useEffect(() => {
    const turnedOn = active && !wasActive.current;
    wasActive.current = active;
    if (!turnedOn || reduceMotion) return;
    const animation = Animated.sequence([
      Animated.timing(scale, { toValue: POP_SCALE, duration: motion.quick, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: motion.quick, useNativeDriver: true }),
    ]);
    animation.start();
    return () => { animation.stop(); scale.setValue(1); };
  }, [active, reduceMotion, scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

// One control in a post's action row: like, comment, share or bookmark.
export function PostAction({ icon, label, active = false, pop = false, className, ...props }: PostActionProps) {
  const glyph = <Icon as={icon} color={active ? 'primary-text' : 'muted-foreground'} filled={active} fillColor="primary" />;
  return <Pressable
    className={cn('min-h-11 min-w-12 flex-row items-center gap-1.5 px-3 active:opacity-70', className)}
    role="button"
    hitSlop={actionHitSlop}
    {...props}
  >
    {pop ? <PopOnActive active={active}>{glyph}</PopOnActive> : glyph}
    {label === undefined ? null : <Text className={cn('text-footnote', active ? 'font-inter-medium text-primary-text' : 'text-muted-foreground')}>
      {label}
    </Text>}
  </Pressable>;
}
