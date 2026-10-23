import { View } from 'react-native';
import { Link } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import { useIncomingRequests } from './use-incoming-requests';

// Opens connection requests. The badge shows the real number waiting, and is
// hidden when there are none.
export function RequestsBell() {
  const { session } = useAuth();
  const { requests } = useIncomingRequests(session?.user.id ?? null);
  const count = requests?.length ?? 0;
  const label = count ? `Connection requests, ${count} waiting` : 'Connection requests';
  return <View>
    <Link href="/connections/requests" asChild><IconButton icon={Bell} accessibilityLabel={label} /></Link>
    {count ? <View pointerEvents="none" className="absolute right-2 top-2 min-w-5 items-center justify-center rounded-full border-2 border-background bg-primary px-1">
      <Text className="font-inter-semibold text-micro text-white">{count > 9 ? '9+' : count}</Text>
    </View> : null}
  </View>;
}
