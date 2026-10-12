import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { House, MessagesSquare, Plus, Search, type LucideIcon } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useProfile } from '@/features/profile/provider';
import { useReduceMotion } from '@/lib/use-reduce-motion';
import { cn } from '@/lib/utils';
import { usePenguinTheme } from '@/theme/provider';
import { colors, layout, motion, radius } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { useNavLayout } from './use-nav-layout';

// The main navigation: exactly five destinations, in this order. A destination is
// either a tab screen in src/app/(protected)/(tabs) or an action that pushes a
// screen above the tabs. Create is an action, so it is never "selected".
//
// Groups is not a destination here: it opens from Discover as screens above the
// tabs (src/app/(protected)/groups).
//
// There is no unread badge on Messages: the app has no tab-level unread state.
type Destination =
  | { kind: 'tab'; name: string; label: string; icon: LucideIcon | 'avatar'; fillable: boolean }
  | { kind: 'action'; name: string; label: string; icon: LucideIcon; href: Href };

const destinations: Destination[] = [
  { kind: 'tab', name: 'home', label: 'Home', icon: House, fillable: true },
  { kind: 'tab', name: 'discover', label: 'Discover', icon: Search, fillable: false },
  { kind: 'action', name: 'create', label: 'Create', icon: Plus, href: '/create-post' },
  { kind: 'tab', name: 'messages', label: 'Messages', icon: MessagesSquare, fillable: true },
  { kind: 'tab', name: 'account', label: 'Profile', icon: 'avatar', fillable: false },
];

const ACTION_PRESS_INTERVAL = 800;
const CREATE_PRESSED_SCALE = 0.94;
// The Create tile: three soft corners and the beak at the bottom left.
const createTileShape = {
  width: layout.createTile, height: layout.createTile, alignItems: 'center', justifyContent: 'center',
  borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: radius.beak,
} as const;

// The capsule behind the selected glyph and label. It cross-fades between items.
function Capsule({ selected, color, instant }: { selected: boolean; color: string; instant: boolean }) {
  const opacity = useState(() => new Animated.Value(selected ? 1 : 0))[0];
  useEffect(() => {
    if (instant) { opacity.setValue(selected ? 1 : 0); return; }
    const animation = Animated.timing(opacity, { toValue: selected ? 1 : 0, duration: motion.standard, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [instant, opacity, selected]);
  return <View className="absolute inset-0 items-center px-0.5 py-1.5" pointerEvents="none">
    <Animated.View style={{ flex: 1, width: '100%', maxWidth: layout.navIndicator.width, borderRadius: radius.full, backgroundColor: color, opacity }} />
  </View>;
}

function CreateSlot({ onPress, color, instant }: { onPress: () => void; color: string; instant: boolean }) {
  const scale = useState(() => new Animated.Value(1))[0];
  const press = (toValue: number) => {
    if (instant) return;
    Animated.timing(scale, { toValue, duration: motion.quick, useNativeDriver: true }).start();
  };
  // The whole slot is tappable, not only the tile.
  return <Pressable
    className="flex-1 items-center justify-center"
    style={{ minHeight: layout.navHeight }}
    accessibilityRole="button"
    accessibilityLabel="Create a post"
    onPressIn={() => press(CREATE_PRESSED_SCALE)}
    onPressOut={() => press(1)}
    onPress={onPress}
  >
    <Animated.View style={[createTileShape, { backgroundColor: color, transform: [{ scale }] }]}>
      <Icon as={Plus} size={24} color="primary-foreground" />
    </Animated.View>
  </Pressable>;
}

// A translucent floating pill on regular phones; the same bar docked to the screen
// edge on small screens, with three-button navigation or with large text; nothing
// while the keyboard is open (see nav-layout.ts). It sits above the screens, which
// scroll underneath it: tab screens pad their lists with useNavContentPadding().
//
// The fill is `nav-surface-solid`. The design's blurred `nav-surface` needs
// expo-blur, which is not installed.
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const mode = useNavLayout();
  const { scheme } = usePenguinTheme();
  const { state: profileState } = useProfile();
  const reduceMotion = useReduceMotion();
  const activeName = state.routes[state.index]?.name;
  const lastActionPress = useRef(0);
  if (mode === 'hidden') return null;
  const floating = mode === 'floating';
  const palette = colors[scheme];
  const profile = profileState.status === 'ready' ? profileState.profile : null;
  const ownName = profile?.display_name?.trim() || 'Penguin student';
  const glass = { backgroundColor: palette['nav-surface-solid'], borderColor: palette['nav-border'] };

  return <View
    className="absolute inset-x-0 bottom-0 items-center"
    pointerEvents="box-none"
    style={floating ? {
      paddingLeft: layout.navInsetX + insets.left, paddingRight: layout.navInsetX + insets.right,
      paddingBottom: insets.bottom + layout.navOffsetBottom,
    } : undefined}
  >
    <View
      className={cn('w-full flex-row', floating ? 'rounded-full border px-1' : 'border-t px-2')}
      style={[glass, floating
        ? { maxWidth: layout.navMaxWidth, ...shadowStyle('raised', scheme) }
        : { paddingBottom: insets.bottom, paddingLeft: 8 + insets.left, paddingRight: 8 + insets.right }]}
      accessibilityRole="tablist"
    >
      {destinations.map((destination) => {
        if (destination.kind === 'action') return <CreateSlot
          key={destination.name}
          color={palette.primary}
          instant={reduceMotion}
          onPress={() => {
            // A second tap before the screen opens must not push it twice.
            const now = Date.now();
            if (now - lastActionPress.current < ACTION_PRESS_INTERVAL) return;
            lastActionPress.current = now;
            router.push(destination.href);
          }}
        />;
        const selected = destination.name === activeName;
        const tone = selected ? 'foreground' : 'nav-label';
        return <Pressable
          key={destination.name}
          className="flex-1 items-center justify-center gap-0.5 py-2.5"
          style={{ minHeight: layout.navHeight }}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          accessibilityLabel={destination.label}
          onPress={() => {
            const route = state.routes.find((candidate) => candidate.name === destination.name);
            if (!route) return;
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }}
        >
          <Capsule selected={selected} color={palette['nav-active']} instant={reduceMotion} />
          <View className="size-6 items-center justify-center">
            {destination.icon === 'avatar'
              // Own avatar; a 2px ring marks the Profile tab as selected.
              ? <View className={cn('rounded-full border-2', selected ? 'border-foreground' : 'border-transparent')} aria-hidden>
                <UserAvatar name={ownName} uri={profile?.avatar_url} size="xs" />
              </View>
              : <Icon
                as={destination.icon}
                size={24}
                color={tone}
                filled={selected && destination.fillable}
                strokeWidth={selected ? 2.25 : 1.75}
              />}
          </View>
          <Text
            numberOfLines={floating ? 1 : 2}
            className={cn('text-center text-micro', selected ? 'font-inter-semibold text-foreground' : 'font-inter-medium text-nav-label')}
          >
            {destination.label}
          </Text>
        </Pressable>;
      })}
    </View>
  </View>;
}
