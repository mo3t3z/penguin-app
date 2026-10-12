import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { useReduceMotion } from '@/lib/use-reduce-motion';
import { motion } from '@/theme/tokens';

// Shows that the other student is typing, where their reply will appear: a
// received-style bubble with three dots and the beak, beside their avatar. It fades
// in (no fade with reduce motion) and the dots never animate. Announced once.
export function TypingIndicator({ name, firstName, avatarUrl }: { name: string; firstName: string; avatarUrl: string | null }) {
  const reduceMotion = useReduceMotion();
  const opacity = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (reduceMotion) { opacity.setValue(1); return; }
    const animation = Animated.timing(opacity, { toValue: 1, duration: motion.standard, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);
  return <Animated.View style={{ opacity }}>
    <View
      className="flex-row items-end gap-2 pt-4"
      accessible
      accessibilityLabel={`${firstName} is typing`}
      accessibilityLiveRegion="polite"
    >
      <UserAvatar name={name} uri={avatarUrl} size="sm" />
      <View className="h-10 flex-row items-center gap-1.5 rounded-lg rounded-bl-beak bg-muted px-4">
        <View className="size-1.5 rounded-full bg-muted-foreground" />
        <View className="size-1.5 rounded-full bg-muted-foreground opacity-70" />
        <View className="size-1.5 rounded-full bg-muted-foreground opacity-50" />
      </View>
    </View>
  </Animated.View>;
}
