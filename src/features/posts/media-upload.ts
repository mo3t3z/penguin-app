import { File, UploadType } from 'expo-file-system';
import type { UploadAuthorization } from './media-service';
import type { UploadReadyPostImage } from './selected-media';

const UPLOAD_TIMEOUT_MS = 4 * 60_000;

export class PostBinaryUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostBinaryUploadError';
  }
}

function header(headers: Record<string, string>, name: string) {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1];
}

export async function uploadPostImageFile(
  image: UploadReadyPostImage,
  authorization: UploadAuthorization,
) {
  const target = new URL(authorization.url);
  if (target.protocol !== 'https:' || target.username || target.password) {
    throw new PostBinaryUploadError('Penguin received an invalid upload destination.');
  }
  if (authorization.method !== 'PUT'
    || header(authorization.headers, 'content-type') !== image.mimeType
    || header(authorization.headers, 'content-length') !== String(image.fileSize)
    || header(authorization.headers, 'x-amz-meta-upload-id') !== authorization.mediaId) {
    throw new PostBinaryUploadError('Penguin received invalid signed upload instructions.');
  }

  const file = new File(image.uri);
  if (!file.exists || file.size !== image.fileSize) {
    throw new PostBinaryUploadError('The prepared image changed or is no longer available.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  const task = file.createUploadTask(authorization.url, {
    httpMethod: authorization.method,
    uploadType: UploadType.BINARY_CONTENT,
    headers: authorization.headers,
    signal: controller.signal,
    sessionType: 'foreground',
  });
  try {
    const result = await task.uploadAsync();
    if (result.status < 200 || result.status >= 300) {
      throw new PostBinaryUploadError(
        result.status === 401 || result.status === 403
          ? 'The image upload authorization expired. Try publishing again.'
          : 'The image upload was not accepted. Check your connection and try again.',
      );
    }
  } catch (cause) {
    if (cause instanceof PostBinaryUploadError) throw cause;
    throw new PostBinaryUploadError(
      controller.signal.aborted
        ? 'The image upload took too long. Check your connection and try again.'
        : 'The image upload was interrupted. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    task.release();
  }
}
