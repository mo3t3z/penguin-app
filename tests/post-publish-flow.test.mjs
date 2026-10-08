import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createImagePublishRecovery, ImagePublishError, publishPost } from '../src/features/posts/publish-flow.ts';

globalThis.__DEV__ = false;

function image(id) {
  return {
    id,
    original: { uri: `file:///${id}-original.jpg`, width: 3000, height: 2000, mimeType: 'image/jpeg', fileName: `${id}.jpg`, fileSize: 4_000_000 },
    processed: { uri: `file:///${id}.jpg`, width: 2048, height: 1365, mimeType: 'image/jpeg', fileName: `${id}.jpg`, fileSize: 1_000_000 },
  };
}

function harness({ failAuthorizeAt = -1, failUploadAt = -1, failFinalizeAt = -1 } = {}) {
  const remote = new Map();
  const calls = { create: [], authorize: [], upload: [], finalize: [], cancel: [], status: 0 };
  let reservation = 0;
  let authorizeFailureUsed = false;
  let uploadFailureUsed = false;
  let finalizeFailureUsed = false;
  const dependencies = {
    async createPost(_content, requestId) { calls.create.push(requestId); return { id: '00000000-0000-4000-8000-000000000099' }; },
    async getStatus() { calls.status += 1; return { uploads: [...remote.values()] }; },
    async authorize(input) {
      calls.authorize.push(input.position);
      if (input.position === failAuthorizeAt && !authorizeFailureUsed) { authorizeFailureUsed = true; throw new Error('authorize failed'); }
      const mediaId = `00000000-0000-4000-8000-${String(++reservation).padStart(12, '0')}`;
      remote.set(input.position, { id: mediaId, position: input.position, status: 'pending', upload_expires_at: '2099-01-01T00:00:00Z' });
      return {
        mediaId, url: 'https://example.invalid/signed', method: 'PUT', expiresAt: '2099-01-01T00:00:00Z', expiresInSeconds: 300,
        headers: { 'content-type': input.mimeType, 'content-length': String(input.sizeBytes), 'x-amz-meta-upload-id': mediaId },
      };
    },
    async upload(_file, authorization) {
      const position = [...remote.values()].find((item) => item.id === authorization.mediaId)?.position;
      calls.upload.push(position);
      if (position === failUploadAt && !uploadFailureUsed) { uploadFailureUsed = true; throw new Error('upload failed'); }
    },
    async finalize(mediaId) {
      const item = [...remote.values()].find((candidate) => candidate.id === mediaId);
      calls.finalize.push(item?.position);
      if (item?.position === failFinalizeAt && !finalizeFailureUsed) { finalizeFailureUsed = true; throw new Error('finalize failed'); }
      item.status = 'ready';
      return { mediaId, status: 'ready' };
    },
    async cancel(mediaId) {
      calls.cancel.push(mediaId);
      for (const [position, item] of remote) if (item.id === mediaId) remote.delete(position);
      return { cancelled: true };
    },
    async wait() {},
  };
  return { calls, dependencies, remote };
}

const requestId = '00000000-0000-4000-8000-000000000010';

test('text-only publishing does not enter the media pipeline', async () => {
  const { calls, dependencies } = harness();
  const recovery = createImagePublishRecovery([]);
  await publishPost({ content: 'Text post', clientRequestId: requestId, images: [], recovery }, dependencies);
  assert.deepEqual(calls.create, [requestId]);
  assert.deepEqual(calls.authorize, []);
  assert.equal(calls.status, 0);
});

test('one image authorizes, uploads, finalizes, and confirms ready', async () => {
  const images = [image('one')];
  const { calls, dependencies } = harness();
  const progress = [];
  await publishPost({ content: 'One image', clientRequestId: requestId, images,
    recovery: createImagePublishRecovery(images), onProgress: (event) => progress.push(event.stage) }, dependencies);
  assert.deepEqual(calls.authorize, [0]);
  assert.deepEqual(calls.upload, [0]);
  assert.deepEqual(calls.finalize, [0]);
  assert.deepEqual(progress, ['publishing', 'uploading', 'finalizing', 'published']);
});

test('multiple images upload sequentially in selected order', async () => {
  const images = [image('one'), image('two'), image('three')];
  const { calls, dependencies } = harness();
  await publishPost({ content: 'Three images', clientRequestId: requestId, images,
    recovery: createImagePublishRecovery(images) }, dependencies);
  assert.deepEqual(calls.authorize, [0, 1, 2]);
  assert.deepEqual(calls.upload, [0, 1, 2]);
  assert.deepEqual(calls.finalize, [0, 1, 2]);
});

test('authorization failure preserves the post recovery state', async () => {
  const images = [image('one')];
  const { calls, dependencies } = harness({ failAuthorizeAt: 0 });
  const recovery = createImagePublishRecovery(images);
  await assert.rejects(() => publishPost({ content: 'Auth fail', clientRequestId: requestId, images, recovery }, dependencies), ImagePublishError);
  assert.equal(recovery.postId, '00000000-0000-4000-8000-000000000099');
  assert.deepEqual(calls.upload, []);
});

test('upload failure keeps ready slots, cancels the failed reservation on retry, and reuses the post request id', async () => {
  const images = [image('one'), image('two'), image('three')];
  const { calls, dependencies, remote } = harness({ failUploadAt: 1 });
  const recovery = createImagePublishRecovery(images);
  await assert.rejects(() => publishPost({ content: 'Retry upload', clientRequestId: requestId, images, recovery }, dependencies), /upload image 2/);
  assert.equal(remote.get(0).status, 'ready');
  assert.equal(remote.has(2), false);

  await publishPost({ content: 'Retry upload', clientRequestId: requestId, images, recovery }, dependencies);
  assert.deepEqual(calls.create, [requestId, requestId]);
  assert.equal(calls.authorize.filter((position) => position === 0).length, 1);
  assert.equal(calls.authorize.filter((position) => position === 1).length, 2);
  assert.equal(calls.cancel.length, 1);
  assert.deepEqual([...remote.values()].map(({ position, status }) => [position, status]), [[0, 'ready'], [1, 'ready'], [2, 'ready']]);
});

test('finalize failure is recovered by status, cancel, and a fresh reservation without duplicating the post', async () => {
  const images = [image('one')];
  const { calls, dependencies } = harness({ failFinalizeAt: 0 });
  const recovery = createImagePublishRecovery(images);
  await assert.rejects(() => publishPost({ content: 'Retry finalize', clientRequestId: requestId, images, recovery }, dependencies), /finalize image 1/);
  assert.equal(recovery.slots[0].uploadCompleted, true);
  assert.equal(recovery.slots[0].finalizeFailed, true);

  await publishPost({ content: 'Retry finalize', clientRequestId: requestId, images, recovery }, dependencies);
  assert.deepEqual(calls.create, [requestId, requestId]);
  assert.equal(calls.cancel.length, 1);
  assert.deepEqual(calls.authorize, [0, 0]);
});
