import { b2Storage } from './b2.ts';
import { safeServerFailure } from './diagnostics.ts';
import { HttpError } from './validation.ts';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('endpoint failures are controlled; dummy PUT/GET signing requires no network', async () => {
  // This isolated test process uses only dummy credentials and has no network permission.
  Deno.env.set('B2_BUCKET_NAME', 'penguin-media');
  Deno.env.set('B2_KEY_ID', 'dummy-test-key');
  Deno.env.set('B2_APPLICATION_KEY', 'dummy-test-secret');
  for (const endpoint of ['s3.us-west-004.backblazeb2.com', 'not a URL', 'http://s3.us-west-004.backblazeb2.com', 'https://s3.us-west-004.backblazeb2.com/bucket']) {
    Deno.env.set('B2_ENDPOINT', endpoint);
    let rejected = false;
    try { b2Storage(); }
    catch (error) { rejected = error instanceof HttpError && error.status === 503; }
    assert(rejected, 'Invalid endpoint must produce a controlled 503');
  }
  Deno.env.set('B2_ENDPOINT', 'https://s3.us-west-004.backblazeb2.com');
  const storage = b2Storage();
  const id = '00000000-0000-4000-8000-000000000001';
  const key = `posts/${id}/${id}/${id}.jpg`;
  const put = await storage.uploadTarget(`uploads/${key}`, 'image/jpeg', 64, id);
  const signed = new URL(put.url);
  assert(put.method === 'PUT', 'PUT method');
  assert(signed.searchParams.get('X-Amz-Expires') === '300', 'Short expiry');
  assert(signed.searchParams.get('X-Amz-SignedHeaders') === 'content-length;content-type;host;x-amz-meta-upload-id', 'Expected signed header contract');
  assert(signed.searchParams.has('X-Amz-Signature'), 'PUT signature exists');
  const get = await storage.readUrl(key, 'dummy-version');
  assert(new URL(get.url).searchParams.has('X-Amz-Signature'), 'GET signature exists');
});

Deno.test('diagnostics withhold raw errors, stack, payloads and unrecognized codes', () => {
  const secret = 'dummy-sensitive-payload';
  const error = new TypeError(secret);
  error.name = secret;
  const diagnostic = safeServerFailure(error, secret);
  assert(diagnostic.errorClass === 'TypeError', 'Class determined without copying name');
  assert(diagnostic.databaseCode === null, 'Unknown database code withheld');
  assert(!JSON.stringify(diagnostic).includes(secret), 'No raw error data');
  const conflict = safeServerFailure(new HttpError(409, 'Image slot is already reserved; inspect uploads or choose another slot.'), '23505');
  assert(conflict.code === 'RESERVATION_CONFLICT' && conflict.databaseCode === '23505', 'Known database error retained');
  assert(safeServerFailure(new HttpError(503, 'Invalid B2 endpoint configuration.')).code === 'INVALID_B2_ENDPOINT', 'Endpoint classification');
});
