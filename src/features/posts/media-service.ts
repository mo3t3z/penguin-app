import { supabase } from '@/lib/supabase';
import { requireUuid } from './validation';
import {
  authorizationValidation,
  MediaRequestError,
  sanitizeInvocationError,
  sanitizeMediaFailure,
} from './media-diagnostics';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadAuthorization = {
  mediaId: string; url: string; method: 'PUT'; headers: Record<string, string>;
  expiresAt: string; expiresInSeconds: number;
};
export type UploadStatus = {
  id: string; position: number; status: 'pending' | 'finalizing' | 'ready'; upload_expires_at: string;
};
type MediaRequestOptions = { signal?: AbortSignal };

async function mediaRequest<T>(body: Record<string, unknown>, options: MediaRequestOptions = {}): Promise<T> {
  if (!supabase) throw new Error('Post media is not configured.');
  const operation = ['authorize', 'status', 'finalize', 'cancel', 'read'].includes(String(body.action)) ? String(body.action) : 'unknown';
  if (__DEV__) console.info('[post-media]', { operation, stage: 'invoke-start' });
  const result = await supabase.functions.invoke<T>('post-media', { body, signal: options.signal });
  const { data, error, response } = result;
  if (__DEV__) console.info('[post-media]', {
    operation,
    stage: 'invoke-returned',
    httpStatus: response?.status ?? null,
    hasError: Boolean(error),
    ...(error ? sanitizeInvocationError(error) : {}),
  });
  if (error) {
    let payload: unknown;
    try { payload = await response?.clone().json(); } catch { /* Non-JSON errors are never printed. */ }
    const diagnostic = sanitizeMediaFailure(response?.status, payload);
    if (__DEV__) console.info('[post-media]', {
      operation,
      stage: 'invoke-failed',
      ...diagnostic,
      ...sanitizeInvocationError(error),
    });
    throw new MediaRequestError(diagnostic);
  }
  if (__DEV__) console.info('[post-media]', { operation, stage: 'invoke-success', httpStatus: response?.status ?? null });
  if (!data) throw new Error('Media service returned no result.');
  return data;
}
export function authorizePostImageUpload(input: { postId: string; mimeType: ImageMime; sizeBytes: number; position: number }) {
  if (__DEV__) console.info('[post-media]', { operation: 'authorize', stage: 'client-validation', ...authorizationValidation(input) });
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType) || !Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > 8 * 1024 * 1024 || !Number.isInteger(input.position) || input.position < 0 || input.position > 3) throw new Error('Use an image up to 8 MiB and a slot from 0 to 3.');
  return mediaRequest<UploadAuthorization>({ action: 'authorize', postId: requireUuid(input.postId), mimeType: input.mimeType, sizeBytes: input.sizeBytes, position: input.position });
}
export function finalizePostImageUpload(mediaId: string) {
  return mediaRequest<{ mediaId: string; status: 'ready' }>({ action: 'finalize', mediaId: requireUuid(mediaId) });
}
export function cancelPostImageUpload(mediaId: string) {
  return mediaRequest<{ cancelled: true }>({ action: 'cancel', mediaId: requireUuid(mediaId) });
}
export function getPostUploadStatus(postId: string) {
  return mediaRequest<{ uploads: UploadStatus[] }>({ action: 'status', postId: requireUuid(postId) });
}
export function getPostImageReadUrl(mediaId: string, options: MediaRequestOptions = {}) {
  return mediaRequest<{ url: string; expiresAt: string }>({ action: 'read', mediaId: requireUuid(mediaId) }, options);
}
export async function deletePostImage(mediaId: string) {
  if (!supabase) throw new Error('Post media is not configured.');
  const { data, error } = await supabase.from('post_media').delete().eq('id', requireUuid(mediaId)).select('id').single();
  if (error) throw error;
  return data;
}
// Never persist/log authorization.url or signed read URLs; treat them as bearer tokens.
