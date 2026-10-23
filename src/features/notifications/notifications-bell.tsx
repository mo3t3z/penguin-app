import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { notificationEvents } from './events';
import { getUnreadNotificationCount } from './service';

const REFRESH_MS = 60_000;

// Opens Notifications. The badge is the real number of unread notices and is hidden
// at zero; it refreshes when the screen is shown, every minute while it is, and
// when notices are read.
export function NotificationsBell() {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    void getUnreadNotificationCount().then(setCount).catch(() => undefined);
  }, []);
  useEffect(() => notificationEvents.subscribe(load), [load]);
  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]));
  const label = count ? `Notifications, ${count} unread` : 'Notifications';
  return <View>
    <Link href="/notifications" asChild><IconButton icon={Bell} accessibilityLabel={label} /></Link>
    {count ? <View pointerEvents="none" className="absolute right-2 top-2 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1">
      <Text className="font-inter-semibold text-micro text-white">{count > 9 ? '9+' : count}</Text>
    </View> : null}
  </View>;
}
