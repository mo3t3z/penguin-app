import { useCallback, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import type { Profile } from '@/lib/database.types';
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
import { POST_TEXT_LIMIT, preparePostPublishAttempt, type PostPublishAttempt } from './validation';

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => [...part][0]).join('').toUpperCase();
}

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

export function CreatePostScreen({ profile }: { profile: Profile }) {
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

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => inFlight.current);
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

  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View className="flex-row items-center justify-between border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Cancel creating post"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}>
          <Text>Cancel</Text>
        </Button>
        <Text variant="h4">Create Post</Text>
        <Button size="sm" loading={busy} disabled={!valid || pickingImages}
          accessibilityLabel={publishFailed ? 'Retry publishing post' : 'Publish post'}
          onPress={() => void publish()}>
          <Text>{busy ? 'Publishing…' : publishFailed ? 'Retry' : 'Publish'}</Text>
        </Button>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerClassName="grow p-5">
        <View className="w-full max-w-lg flex-1 self-center gap-5">
          <View className="flex-row items-center gap-3">
            <Avatar key={profile.avatar_url ?? 'initials'} alt={`${name}'s avatar`} size="lg">
              {profile.avatar_url ? <AvatarImage source={{ uri: profile.avatar_url }} /> : null}
              <AvatarFallback className="bg-secondary">
                <Text className="font-inter-semibold text-accent-foreground">{initialsFor(name)}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="min-w-0 flex-1">
              <Text variant="large" numberOfLines={1}>{name}</Text>
              <Text variant="muted" numberOfLines={1}>@{profile.username ?? 'student'}</Text>
            </View>
          </View>

          <Card className="flex-1 py-0">
            <CardContent className="flex-1 gap-4 px-4 py-4">
              <Input
                variant="multiline"
                className="min-h-64 flex-1 border-0 bg-transparent px-0 py-0"
                value={content}
                onChangeText={updateContent}
                placeholder="What would you like to share with students?"
                accessibilityLabel="Post content"
                editable={!busy && !publishLocked}
                autoFocus
                scrollEnabled={false}
              />

              <SelectedImagePreview images={selectedImages} disabled={busy || publishLocked} onRemove={removeImage} />

              {processingMessage ? <Text variant="small" className="text-primary" accessibilityLiveRegion="polite">
                {processingMessage}
              </Text> : null}

              {publishStatus ? <Text variant="small" className="text-primary" accessibilityLiveRegion="polite">
                {publishStatus}
              </Text> : null}

              {publishFailed && publishLocked ? <Text variant="small" className="text-warning" accessibilityLiveRegion="polite">
                Retry will recover the same post and continue its image uploads.
              </Text> : null}

              <View className="min-h-12 flex-row items-center justify-between gap-3 border-t border-border pt-3">
                <View className="flex-row items-center gap-2">
                  <Button variant="ghost" size="icon" loading={pickingImages} disabled={busy || publishLocked || imageLimitReached}
                    accessibilityLabel={imageLimitReached ? 'Maximum of 4 images selected' : 'Add images from photo library'}
                    onPress={() => void pickImages()}>
                    <Icon as={ImagePlus} color="muted-foreground" />
                  </Button>
                  <Text variant="muted">{selectedImages.length}/{MAX_POST_IMAGES} images</Text>
                </View>
                <Text variant="small" className={length === POST_TEXT_LIMIT ? 'text-warning' : 'text-muted-foreground'}
                  accessibilityLabel={`${length} of ${POST_TEXT_LIMIT} characters`}>
                  {length.toLocaleString()}/{POST_TEXT_LIMIT.toLocaleString()}
                </Text>
              </View>
            </CardContent>
          </Card>

          {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
          {mediaError ? <Text className="text-destructive" accessibilityLiveRegion="polite">{mediaError}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
