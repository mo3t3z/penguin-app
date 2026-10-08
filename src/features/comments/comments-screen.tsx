import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type ListRenderItem,
} from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { ArrowLeft, Send } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/provider';
import {
  COMMENT_TEXT_LIMIT,
  normalizeCommentContent,
  prepareCommentSubmitAttempt,
  type CommentListItem,
  type CommentSubmitAttempt,
} from './comments';
import { CommentItem } from './comment-item';
import { useComments } from './use-comments';

const keyExtractor = (item: CommentListItem) => item.id;

function CommentsSkeleton() {
  return <View className="gap-4" accessibilityLabel="Loading comments" accessibilityState={{ busy: true }}>
    {[0, 1, 2].map((item) => <View key={item} className="flex-row gap-3 py-3">
      <Skeleton className="size-10 rounded-full" />
      <View className="flex-1 gap-2"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" /></View>
    </View>)}
  </View>;
}

export function CommentsScreen({ postId }: { postId: string }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const {
    status, items, nextCursor, loadingMore, error, errorKind, submitting, mutationError,
    refresh: refreshComments, loadMore: loadMoreComments, submitComment, deleteComment, clearMutationError,
  } = useComments(postId);
  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pendingAttempt = useRef<CommentSubmitAttempt | null>(null);
  const length = [...draft].length;
  const valid = draft.trim().length > 0 && length <= COMMENT_TEXT_LIMIT;

  const updateDraft = useCallback((value: string) => {
    if ([...value].length > COMMENT_TEXT_LIMIT) return;
    if (pendingAttempt.current && value.trim() !== pendingAttempt.current.content) {
      pendingAttempt.current = null;
      setRetrying(false);
    }
    setDraft(value);
    clearMutationError();
  }, [clearMutationError]);

  const submit = useCallback(async () => {
    if (!valid || submitting) return;
    let normalized: string;
    try { normalized = normalizeCommentContent(draft); }
    catch { return; }
    const attempt = prepareCommentSubmitAttempt(pendingAttempt.current, normalized, Crypto.randomUUID);
    pendingAttempt.current = attempt;
    Keyboard.dismiss();
    const succeeded = await submitComment(attempt.commentId, attempt.content);
    if (!succeeded) {
      setRetrying(true);
      return;
    }
    pendingAttempt.current = null;
    setRetrying(false);
    setDraft('');
  }, [draft, submitComment, submitting, valid]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshComments(); }
    finally { setRefreshing(false); }
  }, [refreshComments, refreshing]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loadingMore) void loadMoreComments();
  }, [loadMoreComments, loadingMore, nextCursor]);

  const renderComment = useCallback<ListRenderItem<CommentListItem>>(({ item }) => (
    <CommentItem
      comment={item}
      ownComment={item.author_id === userId}
      onDelete={deleteComment}
    />
  ), [deleteComment, userId]);

  const initialLoading = status === 'idle' || status === 'loading';
  const empty = initialLoading ? <CommentsSkeleton /> : status === 'error' ? (
    <Card variant="muted">
      <CardContent className="gap-3">
        <Text variant="h3">Comments couldn’t load</Text>
        <Text variant="muted">{error}</Text>
        <Button variant="outline" onPress={() => void refreshComments()}><Text>Retry</Text></Button>
      </CardContent>
    </Card>
  ) : <View className="items-center gap-2 py-12">
    <Text variant="h3">No comments yet</Text>
    <Text variant="muted" className="text-center">Start the conversation with another student.</Text>
  </View>;

  const footer = loadingMore ? (
    <View className="py-4" accessibilityLabel="Loading more comments" accessibilityState={{ busy: true }}>
      <Skeleton className="h-3 w-24 self-center" />
    </View>
  ) : error && items.length ? <View className="gap-2 py-4">
    <Text variant="muted" className="text-center" accessibilityLiveRegion="polite">{error}</Text>
    <Button variant="outline" onPress={() => errorKind === 'refresh' ? void refresh() : void loadMoreComments()}>
      <Text>{errorKind === 'refresh' ? 'Retry refresh' : 'Retry loading more'}</Text>
    </Button>
  </View> : null;

  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-row items-center border-b border-border px-3 py-2">
        <Button variant="ghost" size="icon" accessibilityLabel="Go back" onPress={() => router.back()}>
          <Icon as={ArrowLeft} />
        </Button>
        <Text variant="h3" className="ml-2">Comments</Text>
      </View>
      <FlatList
        className="flex-1"
        contentContainerClassName="grow px-4 pb-6"
        data={items}
        renderItem={renderComment}
        keyExtractor={keyExtractor}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Post comments"
      />
      <View className="gap-2 border-t border-border bg-background px-4 py-3">
        <View className="w-full max-w-lg self-center gap-2">
          <FormField
            label="Add a comment"
            value={draft}
            onChangeText={updateDraft}
            variant="multiline"
            className="min-h-20"
            placeholder="Write a comment…"
            editable={!submitting}
            maxLength={COMMENT_TEXT_LIMIT}
            hint={`${length.toLocaleString()}/${COMMENT_TEXT_LIMIT.toLocaleString()} characters`}
          />
          {mutationError ? <Text className="text-destructive" accessibilityLiveRegion="polite">{mutationError}</Text> : null}
          <Button
            loading={submitting}
            disabled={!valid}
            accessibilityLabel={retrying ? 'Retry publishing comment' : 'Publish comment'}
            onPress={() => void submit()}
          >
            <Icon as={Send} color="primary-foreground" />
            <Text>{submitting ? 'Publishing…' : retrying ? 'Retry' : 'Comment'}</Text>
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
