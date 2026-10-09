import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { CircleUserRound, House, SquarePlus, type LucideIcon } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// A destination is either a tab screen in src/app/(protected)/(tabs) or an action
// that pushes a screen above the tabs. Add future tabs (Discover, Communities)
// here together with their route file.
type Destination =
  | { kind: 'tab'; name: string; label: string; icon: LucideIcon }
  | { kind: 'action'; name: string; label: string; icon: LucideIcon; href: Href };

const destinations: Destination[] = [
  { kind: 'tab', name: 'home', label: 'Home', icon: House },
  { kind: 'action', name: 'create', label: 'Create', icon: SquarePlus, href: '/create-post' },
  { kind: 'tab', name: 'account', label: 'Profile', icon: CircleUserRound },
];

const ACTION_PRESS_INTERVAL = 800;

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const activeName = state.routes[state.index]?.name;
  const lastActionPress = useRef(0);
  return <View
    className="flex-row border-t border-border bg-card px-2 pt-2"
    style={{ paddingBottom: 8 + insets.bottom }}
    accessibilityRole="tablist"
  >
    {destinations.map((destination) => {
      const selected = destination.kind === 'tab' && destination.name === activeName;
      const onPress = () => {
        if (destination.kind === 'action') {
          // A second tap before the screen opens must not push it twice.
          const now = Date.now();
          if (now - lastActionPress.current < ACTION_PRESS_INTERVAL) return;
          lastActionPress.current = now;
          router.push(destination.href);
          return;
        }
        const route = state.routes.find((candidate) => candidate.name === destination.name);
        if (!route) return;
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      };
      return <Pressable
        key={destination.name}
        className={cn('h-14 flex-1 items-center justify-center gap-1 rounded-md', selected ? 'bg-accent' : 'active:bg-muted')}
        accessibilityRole={destination.kind === 'tab' ? 'tab' : 'button'}
        accessibilityState={destination.kind === 'tab' ? { selected } : undefined}
        accessibilityLabel={destination.kind === 'action' ? 'Create a post' : destination.label}
        onPress={onPress}
      >
        <Icon as={destination.icon} size={22} color={selected ? 'primary' : 'muted-foreground'} />
        <Text
          numberOfLines={1}
          className={cn('text-micro', selected ? 'font-inter-semibold text-accent-foreground' : 'font-inter-medium text-muted-foreground')}
        >
          {destination.label}
        </Text>
      </Pressable>;
    })}
  </View>;
}
