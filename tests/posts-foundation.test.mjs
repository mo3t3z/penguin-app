import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feedCursorFilter, normalizePostContent, preparePostPublishAttempt, requireUuid } from '../src/features/posts/validation.ts';
import {
  appendSelectedImages,
  imageProcessingPlan,
  MAX_POST_IMAGE_BYTES,
  removeSelectedImage,
  selectedImageFromAsset,
  validateUploadReadyImage,
} from '../src/features/posts/selected-media.ts';
import { HttpError, imageMime, inspectImage, integer, readLimited } from '../supabase/functions/_shared/validation.ts';

test('post validation counts Unicode code points and rejects blank/oversized text', () => {
  assert.equal(normalizePostContent('  hello  '), 'hello');
  assert.equal([...normalizePostContent('🐧'.repeat(5000))].length, 5000);
  assert.throws(() => normalizePostContent('🐧'.repeat(5001)));
  assert.throws(() => normalizePostContent(' \t\n'));
});
test('feed cursor preserves microseconds and rejects filter injection', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.match(feedCursorFilter({ createdAt: '2026-10-05T10:20:30.123456+00:00', id }), /\.123456\+00:00/);
  assert.throws(() => feedCursorFilter({ createdAt: '2026-10-05T10:20:30Z),id.gt.0', id }));
  assert.throws(() => requireUuid(`${id},author_id.neq.x`));
});
test('post publish attempts reuse an id for retries and replace it for changed/new drafts', () => {
  let sequence = 0;
  const createId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const first = preparePostPublishAttempt(null, '  campus update  ', createId);
  assert.match(first.clientRequestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first.content, 'campus update');

  const retryAfterTimeout = preparePostPublishAttempt(first, 'campus update', createId);
  assert.strictEqual(retryAfterTimeout, first);

  const changedDraft = preparePostPublishAttempt(first, 'campus update — corrected', createId);
  assert.notEqual(changedDraft.clientRequestId, first.clientRequestId);
  const newPost = preparePostPublishAttempt(null, 'campus update', createId);
  assert.notEqual(newPost.clientRequestId, first.clientRequestId);
});
test('local post images preserve order and metadata while enforcing the four-image limit', () => {
  let sequence = 0;
  const asset = (uri, fileSize) => ({ uri, width: 640, height: 480, type: 'image', mimeType: 'image/jpeg', fileName: `${uri}.jpg`, fileSize });
  const selected = (...assets) => assets.map((item) => selectedImageFromAsset(item, () => `local-${++sequence}`));
  const first = appendSelectedImages([], selected(asset('one', 101), asset('two', 202)));
  const all = appendSelectedImages(first, selected(asset('three', 303), asset('four', 404)));
  assert.deepEqual(all.map(({ original }) => original.uri), ['one', 'two', 'three', 'four']);
  assert.deepEqual(all[0], {
    id: 'local-1',
    original: { uri: 'one', width: 640, height: 480, mimeType: 'image/jpeg', fileName: 'one.jpg', fileSize: 101 },
    processed: null,
  });
  assert.throws(() => appendSelectedImages(all, selected(asset('five', 505))), /up to 4 images/);
  assert.deepEqual(removeSelectedImage(all, 'local-2').map(({ original }) => original.uri), ['one', 'three', 'four']);
  assert.throws(() => selectedImageFromAsset({ ...asset('video', 10), type: 'video' }, () => 'bad'), /not an image/);
});
test('image processing plans preserve aspect ratio, normalize formats, and validate upload-ready output', () => {
  const base = { uri: 'file:///photo', width: 4032, height: 3024, mimeType: 'image/jpeg', fileName: 'photo.jpg', fileSize: 9_000_000 };
  assert.deepEqual(imageProcessingPlan(base), {
    outputMimeType: 'image/jpeg', outputExtension: 'jpg', compression: 0.82, resize: { width: 2048 },
  });
  assert.deepEqual(imageProcessingPlan({ ...base, width: 1200, height: 2000, mimeType: 'image/png', fileName: 'art.png' }), {
    outputMimeType: 'image/png', outputExtension: 'png', compression: 1, resize: null,
  });
  assert.equal(imageProcessingPlan({ ...base, mimeType: 'image/heic', fileName: 'camera.heic' }).outputMimeType, 'image/jpeg');
  assert.throws(() => imageProcessingPlan({ ...base, mimeType: 'image/gif', fileName: 'animated.gif' }), /Choose a JPEG/);
  assert.throws(() => imageProcessingPlan({ ...base, width: 0 }), /invalid dimensions/);

  const ready = { uri: 'file:///ready.jpg', width: 2048, height: 1536, mimeType: 'image/jpeg', fileName: 'ready.jpg', fileSize: 2_000_000 };
  assert.strictEqual(validateUploadReadyImage(ready), ready);
  assert.throws(() => validateUploadReadyImage({ ...ready, fileSize: MAX_POST_IMAGE_BYTES + 1 }), /6 MiB/);
  assert.throws(() => validateUploadReadyImage({ ...ready, width: 2049 }), /dimensions/);
});
test('MIME and slot inputs do not allow arbitrary paths/types', () => {
  assert.equal(imageMime('image/jpeg'), 'image/jpeg');
  for (const mime of ['image/svg+xml', 'text/html', 'image/png;foo=bar', '__proto__']) assert.throws(() => imageMime(mime), HttpError);
  assert.throws(() => integer(4, 0, 3));
  assert.throws(() => integer(1.5, 0, 3));
});
function png(w, h) {
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  new DataView(bytes.buffer).setUint32(16, w);
  new DataView(bytes.buffer).setUint32(20, h);
  bytes[24] = 8; bytes[25] = 2;
  return bytes;
}
test('image inspection derives dimensions from bytes, not request metadata', () => {
  assert.deepEqual(inspectImage(png(640, 480), 2000), { mime: 'image/png', width: 640, height: 480 });
  assert.throws(() => inspectImage(png(8192,8192), 2000));
  assert.throws(() => inspectImage(png(0,480), 2000));
  assert.throws(() => inspectImage(new TextEncoder().encode('<script>alert(1)</script>'), 25));
  const badPng = png(1,1); badPng[26] = 1;
  assert.throws(() => inspectImage(badPng, 100));
});
test('JPEG and WebP dimension parsing, truncation and animated WebP rejection', () => {
  const jpg = new Uint8Array([255,216,255,192,0,11,8,0,100,0,200,1,1,17,0,255,217]);
  assert.deepEqual(inspectImage(jpg,jpg.length), { mime: 'image/jpeg', width: 200, height: 100 });
  assert.throws(() => inspectImage(jpg.slice(0,8), jpg.length));
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode('RIFF')); webp.set(new TextEncoder().encode('WEBPVP8X'),8);
  const view = new DataView(webp.buffer); view.setUint32(4,22,true); view.setUint32(16,10,true);
  webp[24]=9; webp[27]=19;
  assert.deepEqual(inspectImage(webp,30), { mime: 'image/webp', width: 10, height: 20 });
  webp[20]=2; assert.throws(() => inspectImage(webp,30));
});
test('bounded readers reject oversized streams before buffering the full body', async () => {
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8)); c.enqueue(new Uint8Array(8)); c.close(); } });
  await assert.rejects(() => readLimited(stream,10), (e) => e instanceof HttpError && e.status === 413);
});
