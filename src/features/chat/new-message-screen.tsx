import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { Search, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH } from '@/features/discover/search-query';
import { studentDetail } from '@/features/discover/student-search';
import { useStudentSearch } from '@/features/discover/use-student-search';
import { profileDisplayName } from '@/features/profile/profile-format';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { chatErrorKind, conversationOpenErrors, otherParticipant } from './chat';
import { getOrCreateConversation } from './service';
import { useConversations } from './use-conversations';

// One student the message can go to. `conversationId` is set when a conversation
// with them is already loaded, so it opens without asking the database again.
type Recipient = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  detail: string;
  conversationId: string | null;
};

const keyExtractor = (item: Recipient) => item.id;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/messages');
}

function RecipientSkeleton() {
  return <View accessibilityLabel="Loading students" accessibilityState={{ busy: true }}>
    {[0, 1, 2, 3].map((item) => <View key={item} className="min-h-18 flex-row items-center gap-3 px-5">
      <Skeleton className="size-12 rounded-full" />
      <View className="gap-2">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-2.5 w-24 rounded-full" />
      </View>
    </View>)}
  </View>;
}

// New message: search for a student, or pick one you have already talked to, and
// the one-to-one conversation with them opens (the database finds or creates it).
// One recipient only: there are no groups, requests or contact lists to offer.
export function NewMessageScreen({ userId, focusSearch }: { userId: string; focusSearch: boolean }) {
  const { scheme } = usePenguinTheme();
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const search = useStudentSearch(query);
  const conversations = useConversations();
  const refreshConversations = conversations.refresh;
  useEffect(() => { void refreshConversations(); }, [refreshConversations]);

  const typed = query.trim().length > 0;
  const searching = search.status !== 'idle';
  const recent = useMemo<Recipient[]>(() => conversations.items.flatMap((conversation) => {
    const other = otherParticipant(conversation, userId);
    return other.id ? [{
      id: other.id, name: other.name, username: other.username, avatarUrl: other.avatarUrl, detail: '',
      conversationId: conversation.id,
    }] : [];
  }), [conversations.items, userId]);
  const found = useMemo<Recipient[]>(() => search.items.filter((student) => student.id !== userId).map((student) => ({
    id: student.id,
    name: profileDisplayName(student.display_name),
    username: student.username?.trim() || null,
    avatarUrl: student.avatar_url,
    detail: studentDetail(student),
    conversationId: null,
  })), [search.items, userId]);

  const open = useCallback(async (recipient: Recipient) => {
    if (inFlight.current) return;
    inFlight.current = true; setOpening(recipient.id); setError(null);
    Keyboard.dismiss();
    try {
      const conversationId = recipient.conversationId ?? await getOrCreateConversation(recipient.id);
      // Replaces this screen, so Back from the conversation returns to the inbox.
      router.replace({ pathname: '/messages/[conversationId]', params: { conversationId } });
    } catch (cause) {
      setError(conversationOpenErrors[chatErrorKind(cause)]);
    } finally {
      inFlight.current = false; setOpening(null);
    }
  }, []);
  const clear = useCallback(() => setQuery(''), []);
  const renderRecipient = useCallback<ListRenderItem<Recipient>>(({ item }) => <Pressable
    className="min-h-18 flex-row items-center gap-3 px-5 py-2 active:bg-muted"
    role="button"
    disabled={opening !== null}
    accessibilityLabel={`Message ${item.name}${item.username ? `. @${item.username}` : ''}${item.detail ? `. ${item.detail}` : ''}`}
    accessibilityState={{ busy: opening === item.id, disabled: opening !== null }}
    onPress={() => void open(item)}
  >
    <UserAvatar name={item.name} uri={item.avatarUrl} size="lg" />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="font-inter-semibold">{item.name}</Text>
      {item.username || item.detail ? <Text variant="callout" numberOfLines={1} className="text-muted-foreground">
        {[item.username ? `@${item.username}` : '', item.detail].filter(Boolean).join(' · ')}
      </Text> : null}
    </View>
    {opening === item.id ? <ActivityIndicator color={colors[scheme]['primary-text']} /> : null}
  </Pressable>, [open, opening, scheme]);
  const onEndReached = useCallback(() => {
    if (searching && search.hasMore && !search.loadingMore && !search.loadMoreFailed) search.loadMore();
  }, [search, searching]);

  const empty = searching
    ? search.status === 'loading' ? <RecipientSkeleton />
      : search.status === 'error' ? <StatePanel
        icon={WifiOff}
        title="Search couldn’t load"
        description="Check your connection and try again."
        live
        actionLabel="Try again"
        onAction={search.retry}
      /> : <StatePanel
        icon={Search}
        title="No matches just yet"
        description="Try a different name or username."
        live
        actionLabel="Clear search"
        onAction={clear}
      />
    : conversations.status === 'loading' && !typed ? <RecipientSkeleton />
      : <StatePanel
        icon={Search}
        title="Find a student"
        description={typed
          ? `Type at least ${SEARCH_MIN_LENGTH} letters or numbers to search.`
          : 'Search by name or username to start a conversation.'}
        live={typed}
      />;
  const data = searching ? found : typed ? [] : recent;
  const heading = data.length ? <Text variant="small" className="px-5 pb-1 pt-3 text-muted-foreground" role="heading">
    {searching ? 'Students' : 'Recent'}
  </Text> : null;
  const footer = searching && search.loadingMore ? <View className="items-center py-5" accessibilityLabel="Loading more students" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : searching && search.loadMoreFailed ? <View className="gap-3 px-5 pt-5">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      More students couldn’t load. Check your connection and try again.
    </Text>
    <Button variant="outline" onPress={search.loadMore}><Text>Retry loading more</Text></Button>
  </View> : null;

  return <SafeAreaView className="flex-1 bg-background">
    <TopBar title="New message" onBack={goBack} />
    <View className="gap-2 px-5 pb-2 pt-1">
      <Input
        variant="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search students"
        accessibilityLabel="Search students to message"
        maxLength={SEARCH_MAX_LENGTH}
        autoFocus={focusSearch}
        onSubmitEditing={() => Keyboard.dismiss()}
      />
      {error ? <Text variant="caption" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
    <FlatList
      className="flex-1"
      contentContainerClassName="pb-6"
      data={data}
      renderItem={renderRecipient}
      extraData={opening}
      keyExtractor={keyExtractor}
      ListHeaderComponent={heading}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={12}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      accessibilityLabel={searching ? 'Student search results' : 'Recent conversations'}
    />
  </SafeAreaView>;
}
