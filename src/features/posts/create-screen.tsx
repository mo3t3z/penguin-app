import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { Profile } from '@/lib/database.types';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { shadowStyle } from '@/theme/shadow';
import { useSheetSwipe } from './use-sheet-swipe';
import { processPostImage } from './image-processing';
import {
  authorizePostImageUpload,
  cancelPostImageUpload,
  finalizePostImageUpload,
  getPostUploadStatus,
} from './media-service';
import { mediaFailureFromCause } from './media-diagnostics';
import { uploadPostImageFile } from './media-upload';
import {
  createImagePublishRecovery,
  ImagePublishError,
  publishPost,
  type ImagePublishRecovery,
  type PublishProgress,
} from './publish-flow';
import { postPublishedEvents } from './feed-events';
import { createPost, CreatePostTimeoutError } from './service';
import { SelectedImagePreview } from './selected-image-preview';
import {
  appendSelectedImages,
  MAX_POST_IMAGES,
  removeSelectedImage,
  selectedImageFromAsset,
  type SelectedPostImage,
} from './selected-media';
import { hasPostDraft, POST_TEXT_LIMIT, preparePostPublishAttempt, type PostPublishAttempt } from './validation';

// The character counter stays out of the way until the limit is near.
const COUNTER_FROM = 4500;

function publishError(cause: unknown) {
  if (cause instanceof ImagePublishError) return cause.message;
  if (cause instanceof CreatePostTimeoutError) return 'Penguin couldn’t confirm your post. Your draft is still here. Check your connection, then try again.';
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  if (code === '23514' || code === '23502') return 'Your post needs between 1 and 5,000 characters.';
  if (code === '42501' || code === 'PGRST301') return 'Your session or profile is unavailable. Return to your profile and try again.';
  return 'We couldn’t publish your post. Check your connection and try again. Your writing is still here.';
}

function publishProgressLabel(progress: PublishProgress) {
  if (progress.stage === 'uploading') return `Uploading image ${progress.index} of ${progress.total}…`;
  if (progress.stage === 'finalizing') return `Finalizing image ${progress.index} of ${progress.total}…`;
  if (progress.stage === 'published') return 'Published';
  return 'Publishing…';
}

const publishDependencies = {
  createPost,
  getStatus: getPostUploadStatus,
  authorize: authorizePostImageUpload,
  upload: uploadPostImageFile,
  finalize: finalizePostImageUpload,
  cancel: cancelPostImageUpload,
  wait: (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
};

function imagePickerError(cause: unknown) {
  const message = cause instanceof Error ? cause.message.toLowerCase() : '';
  if (message.includes('permission') || message.includes('denied') || message.includes('access')) {
    return 'Penguin could not access your photos. Check photo access in your device settings and try again.';
  }
  return cause instanceof Error && cause.message.startsWith('You can add up to')
    ? cause.message
    : cause instanceof Error && cause.message.startsWith('One selected image')
      ? cause.message
      : 'Penguin could not open that image. Try choosing it again.';
}

// Create is a full-height sheet above the tabs (see the `create-post` screen options
// in src/app/(protected)/_layout.tsx): a raised surface from just under the status
// bar, with a handle. Swiping the handle or header down lowers the sheet, again
// closes it; swiping up expands it. Closing by swipe, Cancel or the system Back asks
// before discarding a draft, so a draft is never lost to a swipe. One scroll
// view holds the author, the text and the photos; the toolbar stays pinned above
// the keyboard.
export function CreatePostScreen({ profile }: { profile: Profile }) {
  const insets = useSafeAreaInsets();
  const { scheme } = usePenguinTheme();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedPostImage[]>([]);
  const [pickingImages, setPickingImages] = useState(false);
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [publishStatus, setPublishStatus] = useState<string | null>(null);
  const [publishLocked, setPublishLocked] = useState(false);
  const [publishFailed, setPublishFailed] = useState(false);
  const inFlight = useRef(false);
  const pendingAttempt = useRef<PostPublishAttempt | null>(null);
  const mediaRecovery = useRef<ImagePublishRecovery | null>(null);
  const mounted = useRef(true);
  const length = [...content].length;
  const valid = content.trim().length > 0 && length <= POST_TEXT_LIMIT;
  const name = profile.display_name?.trim() || 'Penguin student';
  const imageLimitReached = selectedImages.length >= MAX_POST_IMAGES;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const draft = hasPostDraft(content, selectedImages.length);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }, []);
  // Cancel and the system Back share one rule: nothing typed, leave at once;
  // something typed or chosen, ask first.
  const requestClose = useCallback(() => {
    if (inFlight.current) return;
    if (draftRef.current) { Keyboard.dismiss(); setConfirmDiscard(true); } else leave();
  }, [leave]);

  const swipe = useSheetSwipe({ onClose: requestClose, disabled: busy });

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inFlight.current) return true;
      if (!draftRef.current) return false;
      Keyboard.dismiss();
      setConfirmDiscard(true);
      return true;
    });
    return () => { mounted.current = false; listener.remove(); };
  }, []));

  function updateContent(next: string) {
    if (publishLocked) return;
    if ([...next].length <= POST_TEXT_LIMIT) {
      if (pendingAttempt.current && next.trim() !== pendingAttempt.current.content) {
        if (__DEV__) console.info('[CreatePostScreen] changed draft starts a new publish attempt');
        pendingAttempt.current = null;
      }
      setContent(next);
      if (error) setError(null);
    }
  }

  async function publish() {
    if (inFlight.current || pickingImages || !valid) return;
    const attempt = preparePostPublishAttempt(pendingAttempt.current, content, Crypto.randomUUID);
    if (!mediaRecovery.current || attempt !== pendingAttempt.current) {
      mediaRecovery.current = createImagePublishRecovery(selectedImages);
    }
    pendingAttempt.current = attempt;
    const requestSuffix = attempt.clientRequestId.slice(-8);
    if (__DEV__) console.info('[CreatePostScreen] submit start', { requestSuffix });
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMediaError(null);
    setPublishFailed(false);
    setPublishStatus('Publishing…');
    if (selectedImages.length > 0) setPublishLocked(true);
    Keyboard.dismiss();
    try {
      if (__DEV__) console.info('[CreatePostScreen] before createPost', { requestSuffix });
      await publishPost({
        content: attempt.content,
        clientRequestId: attempt.clientRequestId,
        images: selectedImages,
        recovery: mediaRecovery.current,
        onProgress: (progress) => {
          if (mounted.current) setPublishStatus(publishProgressLabel(progress));
        },
      }, publishDependencies);
      pendingAttempt.current = null;
      mediaRecovery.current = null;
      if (__DEV__) console.info('[CreatePostScreen] createPost resolved', { requestSuffix });
      if (mounted.current) {
        if (__DEV__) console.info('[CreatePostScreen] navigation');
        postPublishedEvents.publish({ userId: profile.id });
        router.dismissTo('/home');
      }
    } catch (cause) {
      if (__DEV__) console.info('[CreatePostScreen] caught error', {
        name: cause instanceof Error ? cause.name : 'UnknownError',
        code: cause && typeof cause === 'object' && 'code' in cause ? cause.code : null,
        mediaDiagnostic: mediaFailureFromCause(cause),
      });
      if (mounted.current) {
        setPublishFailed(true);
        setError(publishError(cause));
      }
    } finally {
      if (__DEV__) console.info('[CreatePostScreen] finally');
      inFlight.current = false;
      if (mounted.current) {
        setBusy(false);
        setPublishStatus(null);
      }
    }
  }

  async function pickImages() {
    if (busy || pickingImages || publishLocked) return;
    if (imageLimitReached) {
      setMediaError(`You can add up to ${MAX_POST_IMAGES} images. Remove one to choose another.`);
      return;
    }

    setPickingImages(true);
    setMediaError(null);
    Keyboard.dismiss();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_POST_IMAGES - selectedImages.length,
        orderedSelection: true,
        quality: 1,
      });
      if (result.canceled) return;

      const processed: SelectedPostImage[] = [];
      const failures: string[] = [];
      for (let index = 0; index < result.assets.length; index += 1) {
        const asset = result.assets[index];
        if (mounted.current) setProcessingMessage(`Preparing image ${index + 1} of ${result.assets.length}…`);
        try {
          const selected = selectedImageFromAsset(asset, Crypto.randomUUID);
          processed.push(await processPostImage(selected));
        } catch (cause) {
          const label = asset.fileName?.trim() || `Image ${index + 1}`;
          const reason = cause instanceof Error ? cause.message : 'The image could not be processed.';
          failures.push(`${label}: ${reason}`);
        }
      }

      if (mounted.current && processed.length > 0) {
        setSelectedImages((current) => appendSelectedImages(current, processed));
      }
      if (mounted.current && failures.length > 0) {
        const remaining = failures.length - 1;
        setMediaError(`${failures[0]}${remaining > 0 ? ` ${remaining} other image${remaining === 1 ? '' : 's'} could not be prepared.` : ''}`);
      }
    } catch (cause) {
      if (mounted.current) setMediaError(imagePickerError(cause));
    } finally {
      if (mounted.current) {
        setProcessingMessage(null);
        setPickingImages(false);
      }
    }
  }

  function removeImage(id: string) {
    if (publishLocked) return;
    setSelectedImages((current) => removeSelectedImage(current, id));
    setMediaError(null);
  }

  return <View className="flex-1" style={{ backgroundColor: colors[scheme].overlay, paddingTop: insets.top + 8 }}>
    {/* The one keyboard strategy for this screen, the same as in a conversation:
        "padding" pads by exactly what the keyboard covers on both platforms. */}
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <Animated.View
        className="w-full max-w-xl flex-1 self-center overflow-hidden rounded-t-lg bg-surface-raised"
        style={[shadowStyle('sheet', scheme), { transform: [{ translateY: swipe.translateY }] }]}
        onLayout={(event) => swipe.onSheetLayout(event.nativeEvent.layout.height)}
        accessibilityViewIsModal
      >
        <View {...swipe.panHandlers}>
        <View className="items-center py-2" accessibilityHint="Swipe down to lower or close, up to expand">
          <View className="h-1 w-10 rounded-full bg-border" aria-hidden />
        </View>
        <View className="h-14 flex-row items-center justify-between px-2">
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <Text className="text-body font-inter-semibold" role="heading">New post</Text>
          </View>
          <Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Cancel creating post"
            onPress={requestClose}>
            <Text>Cancel</Text>
          </Button>
          <Button size="sm" className="mr-1" loading={busy} disabled={!valid || pickingImages}
            accessibilityLabel={publishFailed ? 'Retry publishing post' : 'Publish post'}
            onPress={() => void publish()}>
            <Text>{busy ? 'Posting…' : publishFailed ? 'Retry' : 'Post'}</Text>
          </Button>
        </View>
        </View>

        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          contentContainerClassName="grow gap-4 px-5 pb-5 pt-2">
          <View className="flex-row items-center gap-3">
            <UserAvatar name={name} uri={profile.avatar_url} size="md" />
            <View className="min-w-0 flex-1">
              <Text variant="large" numberOfLines={1}>{name}</Text>
              <Text variant="muted" numberOfLines={1}>@{profile.username ?? 'student'}</Text>
            </View>
          </View>

          {/* The scroll view scrolls, not the field, so long text never fights it. */}
          <Input
            variant="multiline"
            className="min-h-32 border-0 bg-transparent px-0"
            value={content}
            onChangeText={updateContent}
            placeholder="What would you like to share with students?"
            accessibilityLabel="Post content"
            editable={!busy && !publishLocked}
            autoFocus
            scrollEnabled={false}
          />

          <SelectedImagePreview images={selectedImages} disabled={busy || publishLocked} onRemove={removeImage} />

          {processingMessage ? <Text variant="small" className="text-muted-foreground" accessibilityLiveRegion="polite">
            {processingMessage}
          </Text> : null}

          {publishStatus ? <Text variant="small" className="text-muted-foreground" accessibilityLiveRegion="polite">
            {publishStatus}
          </Text> : null}

          {publishFailed && publishLocked ? <Text variant="small" className="text-warning" accessibilityLiveRegion="polite">
            Retry will recover the same post and continue its image uploads.
          </Text> : null}

          {error ? <Text variant="callout" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
          {mediaError ? <Text variant="callout" className="text-destructive" accessibilityLiveRegion="polite">{mediaError}</Text> : null}
        </ScrollView>

        <View
          className="min-h-16 flex-row items-center justify-between gap-3 border-t border-divider pl-2 pr-5"
          style={{ paddingBottom: insets.bottom }}
        >
          <View className="flex-row items-center gap-1">
            <Button variant="ghost" loading={pickingImages} disabled={busy || publishLocked || imageLimitReached}
              accessibilityLabel={imageLimitReached ? 'Maximum of 4 images selected' : 'Add images from photo library'}
              onPress={() => void pickImages()}>
              {pickingImages ? null : <Icon as={ImagePlus} size={24} color="primary-text" />}
              <Text>Add photos</Text>
            </Button>
            <Text variant="muted" accessibilityLabel={`${selectedImages.length} of ${MAX_POST_IMAGES} images`}>
              {selectedImages.length}/{MAX_POST_IMAGES}
            </Text>
          </View>
          {length >= COUNTER_FROM ? <Text variant="small" className={length === POST_TEXT_LIMIT ? 'text-warning' : 'text-muted-foreground'}
            accessibilityLabel={`${length} of ${POST_TEXT_LIMIT} characters`}
            accessibilityLiveRegion="polite">
            {length.toLocaleString()}/{POST_TEXT_LIMIT.toLocaleString()}
          </Text> : null}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
    <Dialog
      visible={confirmDiscard}
      title="Discard this post?"
      description="What you wrote and the photos you chose will be lost."
      onClose={() => setConfirmDiscard(false)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setConfirmDiscard(false)}><Text>Keep editing</Text></Button>
        <Button variant="destructive" size="sm" onPress={() => { setConfirmDiscard(false); leave(); }}><Text>Discard</Text></Button>
      </>}
    />
  </View>;
}
