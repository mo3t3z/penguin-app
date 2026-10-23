import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { UserPlus, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import { profileDisplayName } from '@/features/profile/profile-format';
import { ConnectionButton } from './connection-button';
import { useIncomingRequests } from './use-incoming-requests';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/account');
}

// Connection requests waiting for you, each with Accept and Decline.
export function RequestsScreen() {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const { requests, failed, reload } = useIncomingRequests(viewerId);
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Connection requests" onBack={goBack} />
    {failed ? <StatePanel icon={WifiOff} title="Requests couldn’t load" description="Check your connection and try again."
      live actionLabel="Try again" onAction={reload} />
      : requests === null ? <View className="gap-4 p-5" accessibilityLabel="Loading requests" accessibilityState={{ busy: true }}>
        {[0, 1, 2].map(item => <View key={item} className="flex-row items-center gap-3">
          <Skeleton className="size-12 rounded-full" /><Skeleton className="h-3 w-40 rounded-full" />
        </View>)}
      </View>
        : !requests.length ? <StatePanel icon={UserPlus} title="No requests right now"
          description="When a student asks to connect, you can accept or decline here." />
          : <FlatList
            data={requests}
            keyExtractor={item => item.requester.id}
            renderItem={({ item }) => {
              const name = profileDisplayName(item.requester.display_name);
              return <View className="flex-row items-center gap-3 border-b border-divider px-5 py-3">
                <Pressable className="min-w-0 flex-1 flex-row items-center gap-3" accessibilityRole="link" accessibilityLabel={`Open ${name}'s profile`}
                  onPress={() => router.push({ pathname: '/students/[id]', params: { id: item.requester.id } })}>
                  <UserAvatar name={name} uri={item.requester.avatar_url} size="lg" />
                  <View className="min-w-0 flex-1">
                    <Text className="font-inter-semibold" numberOfLines={1}>{name}</Text>
                    {item.requester.username ? <Text className="text-footnote text-muted-foreground" numberOfLines={1}>@{item.requester.username}</Text> : null}
                  </View>
                </Pressable>
                {viewerId ? <ConnectionButton viewerId={viewerId} studentId={item.requester.id} /> : null}
              </View>;
            }}
          />}
  </SafeAreaView>;
}
