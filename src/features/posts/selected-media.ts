import type { ImagePickerAsset } from 'expo-image-picker';

export const MAX_POST_IMAGES = 4;
export const MAX_POST_IMAGE_LONG_EDGE = 2048;
export const MAX_POST_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_PIXELS = 64_000_000;

export type UploadImageMime = 'image/jpeg' | 'image/png';

export type LocalPostImageMetadata = {
  uri: string;
  width: number;
  height: number;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
};

export type UploadReadyPostImage = {
  uri: string;
  width: number;
  height: number;
  mimeType: UploadImageMime;
  fileName: string;
  fileSize: number;
};

export type SelectedPostImage = {
  id: string;
  original: LocalPostImageMetadata;
  processed: UploadReadyPostImage | null;
};

const SOURCE_MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
};
const SUPPORTED_SOURCE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function sourceMime(metadata: Pick<LocalPostImageMetadata, 'mimeType' | 'fileName'>): string | null {
  const declared = metadata.mimeType?.trim().toLowerCase();
  if (declared) return SOURCE_MIME_ALIASES[declared] ?? declared;

  const extension = metadata.fileName?.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return null;
}

export type ImageProcessingPlan = {
  outputMimeType: UploadImageMime;
  outputExtension: 'jpg' | 'png';
  compression: number;
  resize: { width: number } | { height: number } | null;
};

export function imageProcessingPlan(metadata: LocalPostImageMetadata): ImageProcessingPlan {
  if (!metadata.uri.trim()) throw new Error('The selected image has no readable local file.');
  if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)
    || metadata.width <= 0 || metadata.height <= 0) {
    throw new Error('The selected image has invalid dimensions.');
  }
  if (metadata.width * metadata.height > MAX_SOURCE_IMAGE_PIXELS) {
    throw new Error('This image is too large to process safely on this device.');
  }

  const mime = sourceMime(metadata);
  if (!mime || !SUPPORTED_SOURCE_MIMES.has(mime)) {
    throw new Error('Choose a JPEG, PNG, WebP, HEIC, or HEIF image.');
  }

  const longEdge = Math.max(metadata.width, metadata.height);
  const resize = longEdge <= MAX_POST_IMAGE_LONG_EDGE
    ? null
    : metadata.width >= metadata.height
      ? { width: MAX_POST_IMAGE_LONG_EDGE }
      : { height: MAX_POST_IMAGE_LONG_EDGE };
  const preservePng = mime === 'image/png';

  return {
    outputMimeType: preservePng ? 'image/png' : 'image/jpeg',
    outputExtension: preservePng ? 'png' : 'jpg',
    compression: preservePng ? 1 : 0.82,
    resize,
  };
}

export function validateUploadReadyImage(image: UploadReadyPostImage): UploadReadyPostImage {
  if (!image.uri.trim()) throw new Error('The processed image file is missing.');
  if (image.mimeType !== 'image/jpeg' && image.mimeType !== 'image/png') {
    throw new Error('The processed image format is not supported.');
  }
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width <= 0 || image.height <= 0
    || Math.max(image.width, image.height) > MAX_POST_IMAGE_LONG_EDGE
    || image.width * image.height > MAX_POST_IMAGE_LONG_EDGE * MAX_POST_IMAGE_LONG_EDGE) {
    throw new Error('The processed image dimensions are invalid.');
  }
  if (!Number.isInteger(image.fileSize) || image.fileSize <= 0 || image.fileSize > MAX_POST_IMAGE_BYTES) {
    throw new Error('The processed image is larger than Penguin’s 6 MiB mobile limit.');
  }
  return image;
}

export function selectedImageFromAsset(asset: ImagePickerAsset, createId: () => string): SelectedPostImage {
  if (asset.type !== null && asset.type !== undefined && asset.type !== 'image') {
    throw new Error('The selected item is not an image.');
  }
  const original: LocalPostImageMetadata = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
  };
  imageProcessingPlan(original);
  return { id: createId(), original, processed: null };
}

export function appendSelectedImages(current: SelectedPostImage[], additions: SelectedPostImage[]): SelectedPostImage[] {
  if (additions.length > MAX_POST_IMAGES - current.length) {
    throw new Error(`You can add up to ${MAX_POST_IMAGES} images.`);
  }
  return [...current, ...additions];
}

export function removeSelectedImage(images: SelectedPostImage[], id: string): SelectedPostImage[] {
  return images.filter((image) => image.id !== id);
}
