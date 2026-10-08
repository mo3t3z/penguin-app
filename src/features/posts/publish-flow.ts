import type { UploadAuthorization, UploadStatus } from './media-service';
import { authorizationValidation, mediaFailureFromCause } from './media-diagnostics.ts';
import type { SelectedPostImage, UploadReadyPostImage } from './selected-media';

export type PublishProgress =
  | { stage: 'publishing' }
  | { stage: 'uploading'; index: number; total: number }
  | { stage: 'finalizing'; index: number; total: number }
  | { stage: 'published' };

type SlotRecovery = {
  mediaId: string;
  uploadCompleted: boolean;
  finalizeFailed: boolean;
};

export type ImagePublishRecovery = {
  postId: string | null;
  imageIds: string[];
  slots: Record<number, SlotRecovery>;
};

export type ImagePublishDependencies = {
  createPost: (content: string, clientRequestId: string) => Promise<{ id: string }>;
  getStatus: (postId: string) => Promise<{ uploads: UploadStatus[] }>;
  authorize: (input: { postId: string; mimeType: 'image/jpeg' | 'image/png'; sizeBytes: number; position: number }) => Promise<UploadAuthorization>;
  upload: (image: UploadReadyPostImage, authorization: UploadAuthorization) => Promise<void>;
  finalize: (mediaId: string) => Promise<{ mediaId: string; status: 'ready' }>;
  cancel: (mediaId: string) => Promise<{ cancelled: true }>;
  wait?: (milliseconds: number) => Promise<void>;
};

export class ImagePublishError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ImagePublishError';
  }
}

export function createImagePublishRecovery(images: SelectedPostImage[]): ImagePublishRecovery {
  return { postId: null, imageIds: images.map(({ id }) => id), slots: {} };
}

function assertSameImages(recovery: ImagePublishRecovery, images: SelectedPostImage[]) {
  if (recovery.imageIds.length !== images.length
    || recovery.imageIds.some((id, index) => id !== images[index]?.id)) {
    throw new ImagePublishError('The selected images changed during publishing. Start a new post and try again.');
  }
}

async function statusForPosition(dependencies: ImagePublishDependencies, postId: string, position: number) {
  if (__DEV__) console.info('[post-publish]', { operation: 'status', stage: 'request-start', position });
  try {
    const { uploads } = await dependencies.getStatus(postId);
    const result = uploads.find((upload) => upload.position === position) ?? null;
    if (__DEV__) console.info('[post-publish]', {
      operation: 'status',
      stage: 'request-success',
      position,
      result: result?.status ?? 'empty',
    });
    return result;
  } catch (cause) {
    if (__DEV__) console.info('[post-publish]', {
      operation: 'status',
      stage: 'request-failed',
      position,
      diagnostic: mediaFailureFromCause(cause),
    });
    throw cause;
  }
}

async function waitForFinalizingSlot(
  dependencies: ImagePublishDependencies,
  postId: string,
  position: number,
) {
  let slot = await statusForPosition(dependencies, postId, position);
  for (let attempt = 0; slot?.status === 'finalizing' && attempt < 3; attempt += 1) {
    await (dependencies.wait?.(750) ?? Promise.resolve());
    slot = await statusForPosition(dependencies, postId, position);
  }
  return slot;
}

async function cancelPendingSlot(
  dependencies: ImagePublishDependencies,
  recovery: ImagePublishRecovery,
  postId: string,
  position: number,
  mediaId: string,
) {
  try {
    await dependencies.cancel(mediaId);
    delete recovery.slots[position];
    return false;
  } catch (cause) {
    const current = await statusForPosition(dependencies, postId, position);
    if (current?.status === 'ready') {
      recovery.slots[position] = { mediaId: current.id, uploadCompleted: true, finalizeFailed: false };
      return true;
    }
    throw new ImagePublishError('Penguin could not safely restart this image upload. Try again.', { cause });
  }
}

export async function publishPost(
  input: {
    content: string;
    clientRequestId: string;
    images: SelectedPostImage[];
    recovery: ImagePublishRecovery;
    onProgress?: (progress: PublishProgress) => void;
  },
  dependencies: ImagePublishDependencies,
) {
  assertSameImages(input.recovery, input.images);
  input.onProgress?.({ stage: 'publishing' });
  const post = await dependencies.createPost(input.content, input.clientRequestId);
  input.recovery.postId = post.id;

  if (input.images.length === 0) {
    input.onProgress?.({ stage: 'published' });
    return post;
  }

  for (let position = 0; position < input.images.length; position += 1) {
    const image = input.images[position];
    const processed = image.processed;
    if (__DEV__) console.info('[post-publish]', {
      operation: 'prepare',
      stage: 'processed-image-check',
      position,
      processedReady: Boolean(processed),
    });
    if (!processed) {
      if (__DEV__) console.info('[post-publish]', {
        operation: 'prepare',
        stage: 'validation-failed',
        position,
        reason: 'processed-image-missing',
      });
      throw new ImagePublishError(`Image ${position + 1} is not ready for upload.`);
    }

    let remote = await statusForPosition(dependencies, post.id, position);
    if (remote?.status === 'ready') {
      input.recovery.slots[position] = { mediaId: remote.id, uploadCompleted: true, finalizeFailed: false };
      continue;
    }
    if (remote?.status === 'finalizing') {
      remote = await waitForFinalizingSlot(dependencies, post.id, position);
      if (remote?.status === 'ready') {
        input.recovery.slots[position] = { mediaId: remote.id, uploadCompleted: true, finalizeFailed: false };
        continue;
      }
      throw new ImagePublishError(`Image ${position + 1} is still finalizing. Try again shortly.`);
    }

    const local = input.recovery.slots[position];
    if (remote?.status === 'pending') {
      const canRetryFinalize = local?.mediaId === remote.id && local.uploadCompleted && !local.finalizeFailed;
      if (canRetryFinalize) {
        input.onProgress?.({ stage: 'finalizing', index: position + 1, total: input.images.length });
        try {
          await dependencies.finalize(remote.id);
          local.finalizeFailed = false;
          continue;
        } catch (cause) {
          local.finalizeFailed = true;
          throw new ImagePublishError(`Penguin could not finalize image ${position + 1}. Try again.`, { cause });
        }
      }
      const becameReady = await cancelPendingSlot(dependencies, input.recovery, post.id, position, remote.id);
      if (becameReady) continue;
    }

    input.onProgress?.({ stage: 'uploading', index: position + 1, total: input.images.length });
    let authorization: UploadAuthorization;
    try {
      if (__DEV__) console.info('[post-publish]', {
        operation: 'authorize',
        stage: 'request-start',
        position,
        validation: authorizationValidation({
          postId: post.id,
          mimeType: processed.mimeType,
          sizeBytes: processed.fileSize,
          position,
        }),
      });
      authorization = await dependencies.authorize({
        postId: post.id,
        mimeType: processed.mimeType,
        sizeBytes: processed.fileSize,
        position,
      });
      if (__DEV__) console.info('[post-publish]', {
        operation: 'authorize',
        stage: 'request-success',
        position,
      });
    } catch (cause) {
      if (__DEV__) console.info('[post-publish]', {
        operation: 'authorize',
        stage: 'request-failed',
        position,
        diagnostic: mediaFailureFromCause(cause),
      });
      throw new ImagePublishError(`Penguin could not authorize image ${position + 1}. Try again.`, { cause });
    }
    const slot = { mediaId: authorization.mediaId, uploadCompleted: false, finalizeFailed: false };
    input.recovery.slots[position] = slot;
    try {
      await dependencies.upload(processed, authorization);
      slot.uploadCompleted = true;
    } catch (cause) {
      throw new ImagePublishError(`Penguin could not upload image ${position + 1}. Try again.`, { cause });
    }

    input.onProgress?.({ stage: 'finalizing', index: position + 1, total: input.images.length });
    try {
      await dependencies.finalize(authorization.mediaId);
    } catch (cause) {
      slot.finalizeFailed = true;
      throw new ImagePublishError(`Penguin could not finalize image ${position + 1}. Try again.`, { cause });
    }
  }

  const confirmed = await dependencies.getStatus(post.id);
  const allReady = input.images.every((_, position) =>
    confirmed.uploads.some((upload) => upload.position === position && upload.status === 'ready'));
  if (!allReady) throw new ImagePublishError('Penguin could not confirm every image. Try again.');

  input.onProgress?.({ stage: 'published' });
  return post;
}
