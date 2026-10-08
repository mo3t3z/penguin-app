import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import type { Database } from '../../../src/lib/database.types.ts';
import { b2Storage } from '../_shared/b2.ts';
import { safeServerFailure } from '../_shared/diagnostics.ts';
import { HttpError, IMAGE_TYPES, imageMime, integer, MAX_IMAGE_BYTES, readLimited, uuid } from '../_shared/validation.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: cors }); }
function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'Media service is not configured.');
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  let operation = 'unknown';
  let stage = 'authenticate';
  let databaseCode: unknown;
  function boundary(next: string) {
    stage = next;
    console.info(JSON.stringify({ component: 'post-media', operation, stage }));
  }
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization || !/^Bearer \S+$/i.test(authorization)) throw new HttpError(401, 'Sign in to access post media.');
    const userClient = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    // Validate the user with Auth, not a locally decoded or client-supplied ID.
    const { data: auth, error: authError } = await userClient.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) throw new HttpError(401, 'Invalid or expired session.');
    stage = 'parse-request';
    if (!req.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(await readLimited(req.body, 4096)));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Invalid JSON object.'); }
    operation = typeof body.action === 'string' && ['authorize', 'status', 'read', 'finalize', 'cancel'].includes(body.action) ? body.action : 'unknown';
    stage = 'admin-client';
    const admin = createClient<Database>(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    async function ownPost(postId: string) {
      const { data, error } = await userClient.from('posts').select('id').eq('id', postId).eq('author_id', auth.user!.id).maybeSingle();
      if (error) { databaseCode = error.code; throw new HttpError(503, 'Unable to verify post access.'); }
      if (!data) throw new HttpError(404, 'Post not found.');
    }
    if (body.action === 'authorize') {
      boundary('validate-input');
      const postId = uuid(body.postId);
      const mime = imageMime(body.mimeType);
      const size = integer(body.sizeBytes, 1, MAX_IMAGE_BYTES);
      const position = integer(body.position, 0, 3);
      boundary('ownership-start');
      await ownPost(postId);
      boundary('ownership-ok');
      boundary('b2-config-start');
      const storage = b2Storage(); // Validate server configuration before reserving a slot.
      boundary('b2-config-ok');
      stage = 'generate-reservation';
      const id = crypto.randomUUID();
      const key = `posts/${auth.user.id}/${postId}/${id}.${IMAGE_TYPES[mime]}`;
      const uploadKey = `uploads/${key}`;
      const expiresAt = new Date(Date.now() + 300_000).toISOString();
      boundary('reservation-start');
      const { error } = await admin.from('post_media').insert({
        id, post_id: postId, storage_provider: 'b2', storage_key: key, upload_key: uploadKey,
        mime_type: mime, size_bytes: size, position, upload_expires_at: expiresAt,
      });
      if (error) {
        databaseCode = error.code;
        throw new HttpError(error.code === '23505' ? 409 : 503, error.code === '23505' ? 'Image slot is already reserved; inspect uploads or choose another slot.' : 'Unable to reserve upload.');
      }
      boundary('reservation-ok');
      boundary('presign-start');
      const target = await storage.uploadTarget(uploadKey, mime, size, id);
      boundary('presign-ok');
      stage = 'authorize-response';
      return json({ mediaId: id, expiresAt, ...target });
    }
    stage = 'dispatch';
    if (body.action === 'status') {
      const postId = uuid(body.postId);
      await ownPost(postId);
      const { data, error } = await admin.from('post_media').select('id,position,status,upload_expires_at').eq('post_id', postId).order('position');
      if (error) throw new HttpError(503, 'Unable to inspect uploads.');
      return json({ uploads: data });
    }
    const mediaId = uuid(body.mediaId);
    if (body.action === 'read') {
      // First prove this precise row is visible under the caller's RLS.
      const { data: visible, error: visibleError } = await userClient.from('post_media').select('id').eq('id', mediaId).maybeSingle();
      if (visibleError) throw new HttpError(503, 'Unable to verify media access.');
      if (!visible) throw new HttpError(404, 'Media not found.');
      const { data: row, error } = await admin.from('post_media').select('*').eq('id', mediaId).eq('status', 'ready').maybeSingle();
      if (error) throw new HttpError(503, 'Unable to read media.');
      if (!row?.storage_version) throw new HttpError(404, 'Media not found.');
      if (row.storage_provider !== 'b2') throw new HttpError(503, 'Unsupported storage provider.');
      return json(await b2Storage().readUrl(row.storage_key, row.storage_version));
    }
    if (body.action !== 'finalize' && body.action !== 'cancel') throw new HttpError(400, 'Unknown media action.');
    const { data: row, error: rowError } = await admin.from('post_media').select('*').eq('id', mediaId).maybeSingle();
    if (rowError) throw new HttpError(503, 'Unable to inspect upload.');
    if (!row) throw new HttpError(404, 'Upload not found.');
    await ownPost(row.post_id);
    if (body.action === 'cancel') {
      if (row.status === 'ready') throw new HttpError(409, 'Use the media deletion API for a published image.');
      const { data, error } = await admin.from('post_media').delete().eq('id', mediaId).neq('status', 'ready').select('id');
      if (error) throw new HttpError(503, 'Unable to cancel upload.');
      if (!data?.length) throw new HttpError(409, 'Upload was finalized concurrently; refresh the post.');
      return json({ cancelled: true }); // Trigger durably schedules both keys for cleanup.
    }
    if (row.status === 'ready') return json({ mediaId, status: 'ready' }); // Retry-safe success.
    if (row.status !== 'pending') throw new HttpError(409, 'Finalization is already running. Retry status, or cancel if abandoned.');
    if (Date.parse(row.upload_expires_at) + 600_000 < Date.now()) throw new HttpError(410, 'Upload expired; cancel it and request another.');
    if (row.storage_provider !== 'b2') throw new HttpError(503, 'Unsupported storage provider.');
    const storage = b2Storage();
    const { data: claimed, error: claimError } = await admin.from('post_media').update({ status: 'finalizing' }).eq('id', mediaId).eq('status', 'pending').select('id').maybeSingle();
    if (claimError || !claimed) throw new HttpError(409, 'Upload changed; refresh its status.');
    try {
      const metadata = await storage.validateAndCopy(row);
      const { data: saved, error } = await admin.from('post_media').update({ ...metadata, status: 'ready' }).eq('id', mediaId).eq('status', 'finalizing').select('id').maybeSingle();
      if (error || !saved) throw new HttpError(409, 'Unable to publish media; refresh status before retrying.');
      return json({ mediaId, status: 'ready' });
    } catch (error) {
      // Conditional reset cannot undo an already-committed ready state. If a process
      // dies before here, owner cancellation/expiry cleanup recovers the slot.
      await admin.from('post_media').update({ status: 'pending' }).eq('id', mediaId).eq('status', 'finalizing');
      throw error;
    }
  } catch (error) {
    // Never log raw provider errors, bearer tokens, presigned URLs or env values.
    console.error(JSON.stringify({ component: 'post-media', operation, stage, ...safeServerFailure(error, databaseCode) }));
    return error instanceof HttpError ? json({ error: error.message }, error.status) : json({ error: 'Media operation failed; retry later.' }, 500);
  }
});
