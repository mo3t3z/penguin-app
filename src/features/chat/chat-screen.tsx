import { useCallback } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, View, type ListRenderItem } from 'react-native';
import { router } from 'expo-router';
import { Ban, MessageCircle, MessageCircleOff, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { messageDayLabel, startsNewDay, type ChatMessage } from './chat';
import { Composer } from './composer';
import { MessageBubble } from './message-bubble';
import { useChat } from './use-chat';

const keyExtractor = (item: ChatMessage) => item.id;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/messages');
}

function ThreadSkeleton() {
  return <View className="flex-1 justify-end gap-3 px-4 pb-4" accessibilityLabel="Loading messages" accessibilityState={{ busy: true }}>
    <Skeleton className="h-12 w-[62%] self-start rounded-lg" />
    <Skeleton className="h-12 w-[54%] self-end rounded-lg" />
    <Skeleton className="h-16 w-[70%] self-start rounded-lg" />
    <Skeleton className="h-12 w-[46%] self-end rounded-lg" />
  </View>;
}

// Figma "Chat": title bar with the other student's name, the messages (newest at
// the bottom) and the composer. Sprint 6A has no live delivery: messages from the
// other student appear when the conversation is opened again.
export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  const {
    status, userId, other, items, hasOlder, loadingOlder, olderFailed, composer, blockBusy, notice,
    send, retry, loadOlder, block, unblock, reload,
  } = useChat(conversationId);
  const name = other?.name ?? 'Messages';
  const firstName = name.split(/\s+/)[0];

  const confirmBlock = () => {
    Alert.alert(
      `Block ${name}?`,
      'Neither of you will be able to send messages in this conversation. You can still read it, and you can unblock at any time.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => void block() }],
    );
  };
  const renderMessage = useCallback<ListRenderItem<ChatMessage>>(({ item, index }) => <MessageBubble
    message={item}
    mine={item.sender_id !== null && item.sender_id === userId}
    dayLabel={startsNewDay(items, index) ? messageDayLabel(item.created_at) : null}
    onRetry={retry}
  />, [items, retry, userId]);
  const onEndReached = useCallback(() => {
    if (hasOlder && !loadingOlder && !olderFailed) void loadOlder();
  }, [hasOlder, loadOlder, loadingOlder, olderFailed]);

  // The list is inverted, so its footer is the top of the conversation.
  const top = loadingOlder ? <View className="items-center py-4" accessibilityLabel="Loading earlier messages" accessibilityState={{ busy: true }}>
    <Skeleton className="h-2.5 w-24 rounded-full" />
  </View> : olderFailed ? <View className="gap-2 py-3">
    <Text variant="caption" className="text-center text-muted-foreground" accessibilityLiveRegion="polite">
      Earlier messages couldn’t load.
    </Text>
    <Button variant="outline" onPress={() => void loadOlder()}><Text>Retry loading earlier messages</Text></Button>
  </View> : null;

  const canBlock = status === 'ready' && composer !== 'deleted' && composer !== 'blocked-by-me';
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TopBar
        title={name}
        onBack={goBack}
        actions={canBlock ? <IconButton icon={Ban} accessibilityLabel={`Block ${name}`} disabled={blockBusy} onPress={confirmBlock} /> : undefined}
      />
      {status === 'loading' ? <ThreadSkeleton />
        : status === 'error' ? <View className="flex-1"><StatePanel
          icon={WifiOff}
          title="Messages couldn’t load"
          description="Check your connection and try again."
          live
          actionLabel="Try again"
          onAction={reload}
        /></View>
          : status === 'missing' ? <View className="flex-1"><StatePanel
            icon={MessageCircleOff}
            title="Conversation not found"
            description="This conversation isn’t available."
            actionLabel="Go back"
            onAction={goBack}
          /></View>
            : items.length === 0 ? <View className="flex-1 justify-center"><StatePanel
              icon={MessageCircle}
              title="No messages yet"
              description={composer === 'open' ? `Say hello to ${firstName}.` : 'There are no messages in this conversation.'}
            /></View>
              : <FlatList
                className="flex-1"
                contentContainerClassName="px-4 py-2"
                inverted
                data={items}
                renderItem={renderMessage}
                keyExtractor={keyExtractor}
                ListFooterComponent={top}
                onEndReached={onEndReached}
                onEndReachedThreshold={0.4}
                initialNumToRender={20}
                maxToRenderPerBatch={12}
                windowSize={9}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                accessibilityLabel={`Messages with ${name}`}
              />}
      {status === 'ready' ? <View className="gap-2 px-4 pb-3 pt-2">
        {notice ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">{notice}</Text> : null}
        {composer === 'deleted' ? <Text variant="muted" className="py-2 text-center">
          This student deleted their account. You can still read your conversation.
        </Text> : composer === 'blocked-by-me' ? <View className="gap-2">
          <Text variant="muted" className="text-center">You blocked {name}. Unblock to send messages.</Text>
          <Button variant="outline" loading={blockBusy} accessibilityLabel={`Unblock ${name}`} onPress={() => void unblock()}>
            <Text>Unblock</Text>
          </Button>
        </View> : <Composer placeholder={`Message ${firstName}…`} onSend={send} />}
      </View> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
