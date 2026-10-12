import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Pressable, View, type ListRenderItem } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { ArrowLeft, Ellipsis, MessageCircle, MessageCircleOff, WifiOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatePanel } from '@/components/social/state-panel';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAppActive } from '@/lib/use-app-active';
import { DELETED_STUDENT, messageDayLabel, messageGroupPosition, startsNewDay, type ChatMessage } from './chat';
import { Composer } from './composer';
import { MessageBubble } from './message-bubble';
import { TypingIndicator } from './typing-indicator';
import { useChat } from './use-chat';
import { useTyping } from './use-typing';

const keyExtractor = (item: ChatMessage) => item.id;
const deletedSender = { name: DELETED_STUDENT, avatarUrl: null };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/messages');
}

function ThreadSkeleton() {
  return <View className="flex-1 justify-end gap-3 px-4 pb-4" accessibilityLabel="Loading messages" accessibilityState={{ busy: true }}>
    <Skeleton className="ml-9 h-11 w-[58%] self-start rounded-lg" />
    <Skeleton className="h-11 w-[54%] self-end rounded-lg" />
    <Skeleton className="ml-9 h-16 w-[64%] self-start rounded-lg" />
    <Skeleton className="h-11 w-[46%] self-end rounded-lg" />
  </View>;
}

// A one-to-one conversation: a header with the other student's avatar, name and
// username, the messages (newest at the bottom) and the composer. The header shows
// no presence and offers no call, because neither exists. New messages, the
// receipt on your newest message and the typing bubble arrive live (see use-chat
// and use-typing).
export function ChatScreen({ conversationId }: { conversationId: string | null }) {
  // The typing hook, which owns the private channel, is created after the chat
  // hook, so a read is announced through this reference.
  const signalReadRef = useRef<() => void>(() => {});
  const onMarkedRead = useCallback(() => signalReadRef.current(), []);
  const {
    status, userId, other, items, hasOlder, loadingOlder, olderFailed, composer, blockBusy, notice, receipt,
    send, retry, loadOlder, block, unblock, reload, refreshReceipt,
  } = useChat(conversationId, onMarkedRead);
  const name = other?.name ?? 'Messages';
  const firstName = name.split(/\s+/)[0];
  const appActive = useAppActive();
  const focused = useIsFocused();
  // Typing is exchanged only while both students can message each other and this
  // screen is in view.
  const { otherTyping, draftChanged, clearOtherTyping, signalRead } = useTyping({
    conversationId, userId, otherId: other?.id ?? null,
    enabled: status === 'ready' && composer === 'open' && focused && appActive,
    onPeerRead: refreshReceipt,
  });
  useEffect(() => { signalReadRef.current = signalRead; }, [signalRead]);
  const newest = items[0];
  const newestIncomingId = newest && !newest.delivery && newest.sender_id !== userId ? newest.id : null;
  // Their message arriving ends "typing" at once.
  useEffect(() => { if (newestIncomingId) clearOtherTyping(); }, [clearOtherTyping, newestIncomingId]);

  const confirmBlock = () => {
    Alert.alert(
      `Block ${name}?`,
      'Neither of you will be able to send messages in this conversation. You can still read it, and you can unblock at any time.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => void block() }],
    );
  };
  const otherId = other?.id ?? null;
  const openProfile = () => {
    if (otherId) router.push({ pathname: '/students/[id]', params: { id: otherId } });
  };
  const openMenu = () => {
    Alert.alert(name, undefined, [
      { text: 'View profile', onPress: openProfile },
      { text: 'Block', style: 'destructive', onPress: confirmBlock },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  // The other student, for the avatar beside their messages. A message whose sender
  // deleted their account shows no trace of the former profile.
  const otherAvatarUrl = other?.avatarUrl ?? null;
  const sender = useMemo(() => ({ name, avatarUrl: otherAvatarUrl }), [name, otherAvatarUrl]);
  const renderMessage = useCallback<ListRenderItem<ChatMessage>>(({ item, index }) => <MessageBubble
    message={item}
    mine={item.sender_id !== null && item.sender_id === userId}
    dayLabel={startsNewDay(items, index) ? messageDayLabel(item.created_at) : null}
    receipt={receipt?.messageId === item.id ? receipt.receipt : null}
    group={messageGroupPosition(items, index)}
    sender={item.sender_id === null ? deletedSender : sender}
    onRetry={retry}
  />, [items, receipt, retry, sender, userId]);
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

  // Typing shows as a bubble where the reply will appear. The list is inverted, so
  // its header is the bottom of the conversation.
  const typing = otherTyping ? <TypingIndicator name={name} firstName={firstName} avatarUrl={otherAvatarUrl} /> : null;

  const canBlock = status === 'ready' && composer !== 'deleted' && composer !== 'blocked-by-me';
  return <SafeAreaView className="flex-1 bg-background">
    {/* The one keyboard strategy for this screen. "padding" measures how much of
        this view the keyboard covers and pads by exactly that, on both platforms:
        if Android has already resized the window the overlap is zero, so the two
        can never add up. The safe-area inset below it ends up behind the keyboard,
        which is why the composer sits directly on top of it with no gap. The list
        is inverted, so it shrinks from the top and the newest messages stay in view. */}
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <View className="min-h-16 flex-row items-center gap-1 border-b border-divider pl-1 pr-2">
        <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={goBack} />
        <Pressable
          className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
          role="button"
          disabled={!otherId}
          accessibilityLabel={otherId ? `View ${name}’s profile` : name}
          onPress={openProfile}
        >
          {other ? <UserAvatar name={name} uri={other.avatarUrl} size="md" /> : null}
          <View className="min-w-0 flex-1">
            <Text variant="large" numberOfLines={1} role="heading">{name}</Text>
            {other?.username ? <Text variant="muted" numberOfLines={1}>@{other.username}</Text> : null}
          </View>
        </Pressable>
        {canBlock ? <IconButton icon={Ellipsis} accessibilityLabel={`More options for ${name}`} disabled={blockBusy} onPress={openMenu} /> : null}
      </View>
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
            : items.length === 0 ? <View className="flex-1 justify-center">
              <StatePanel
                icon={MessageCircle}
                title="No messages yet"
                description={composer === 'open' ? `Say hello to ${firstName}.` : 'There are no messages in this conversation.'}
              />
              {typing ? <View className="px-4">{typing}</View> : null}
            </View>
              : <FlatList
                className="flex-1"
                contentContainerClassName="px-4 py-2"
                inverted
                data={items}
                renderItem={renderMessage}
                extraData={receipt}
                keyExtractor={keyExtractor}
                // A new message does not move what the student is reading further up; at
                // the bottom of the conversation it scrolls into view.
                maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
                ListHeaderComponent={typing}
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
      {status === 'ready' ? <View className="gap-2 px-3 pb-2 pt-2">
        {notice ? <Text variant="caption" className="text-muted-foreground" accessibilityLiveRegion="polite">{notice}</Text> : null}
        {composer === 'deleted' ? <Text variant="muted" className="py-2 text-center">
          This student deleted their account. You can still read your conversation.
        </Text> : composer === 'blocked-by-me' ? <View className="gap-2">
          <Text variant="muted" className="text-center">You blocked {name}. Unblock to send messages.</Text>
          <Button variant="outline" loading={blockBusy} accessibilityLabel={`Unblock ${name}`} onPress={() => void unblock()}>
            <Text>Unblock</Text>
          </Button>
        </View> : <Composer placeholder={`Message ${firstName}…`} onSend={send} onDraftChange={draftChanged} />}
      </View> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
