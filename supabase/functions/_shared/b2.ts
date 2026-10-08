import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { HttpError, inspectImage, readLimited } from './validation.ts';

function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(503, 'Media service is not configured.');
  return value;
}

export function b2Storage() {
  const endpointValue = secret('B2_ENDPOINT');
  let endpoint: URL;
  try { endpoint = new URL(endpointValue); }
  catch { throw new HttpError(503, 'Invalid B2 endpoint configuration.'); }
  const region = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(endpoint.hostname)?.[1];
  if (!region || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new HttpError(503, 'Invalid B2 endpoint configuration.');
  }
  const bucket = secret('B2_BUCKET_NAME');
  if (bucket !== 'penguin-media') throw new HttpError(503, 'Unexpected media bucket configuration.');
  const aws = new AwsClient({ accessKeyId: secret('B2_KEY_ID'), secretAccessKey: secret('B2_APPLICATION_KEY'), service: 's3', region, retries: 0 });
  function url(key: string) {
    if (!/^(uploads\/)?posts\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) throw new HttpError(500, 'Invalid stored media key.');
    return new URL(`${endpoint.origin}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
  }
  async function request(target: URL, init: RequestInit = {}) {
    const signed = await aws.sign(target.toString(), { ...init, aws: { allHeaders: true } });
    const response = await fetch(signed, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, 'Storage operation failed; retry later.'); }
    return response;
  }
  return {
    async uploadTarget(key: string, mime: string, bytes: number, uploadId: string) {
      const target = url(key);
      target.searchParams.set('X-Amz-Expires', '300');
      const headers = { 'content-type': mime, 'content-length': String(bytes), 'x-amz-meta-upload-id': uploadId };
      const signed = await aws.sign(target.toString(), { method: 'PUT', headers, aws: { signQuery: true, allHeaders: true } });
      // A transport that cannot preserve the signed length must NOT omit it;
      // validate device support in 3B before shipping the direct upload client.
      return { url: signed.url, method: 'PUT' as const, headers, expiresInSeconds: 300 };
    },
    async validateAndCopy(row: { id: string; upload_key: string; storage_key: string; size_bytes: number; mime_type: string }) {
      const source = url(row.upload_key);
      const head = await request(source, { method: 'HEAD' });
      const version = head.headers.get('x-amz-version-id');
      if (!version || head.headers.get('content-type') !== row.mime_type || Number(head.headers.get('content-length')) !== row.size_bytes || head.headers.get('x-amz-meta-upload-id') !== row.id) {
        throw new HttpError(400, 'Uploaded object does not match its reservation.');
      }
      source.searchParams.set('versionId', version);
      const prefix = await request(source, { headers: { Range: `bytes=0-${Math.min(row.size_bytes, 65536) - 1}` } });
      if (prefix.headers.get('x-amz-version-id') !== version) { await prefix.body?.cancel(); throw new HttpError(502, 'Storage version verification failed.'); }
      const info = inspectImage(await readLimited(prefix.body, 65536), row.size_bytes);
      if (info.mime !== row.mime_type) throw new HttpError(400, 'Image contents do not match the declared type.');
      const copy = await request(url(row.storage_key), {
        method: 'PUT',
        headers: {
          'x-amz-copy-source': `${bucket}/${row.upload_key}?versionId=${encodeURIComponent(version)}`,
          'x-amz-metadata-directive': 'REPLACE', 'content-type': info.mime,
          'cache-control': 'private, max-age=300', 'content-disposition': 'inline',
        },
      });
      const xml = new TextDecoder().decode(await readLimited(copy.body, 16384));
      const finalVersion = copy.headers.get('x-amz-version-id');
      if (!finalVersion || copy.headers.get('x-amz-copy-source-version-id') !== version || !xml.includes('<CopyObjectResult') || /<Error[\s>]/.test(xml)) throw new HttpError(502, 'Storage copy verification failed.');
      return { width: info.width, height: info.height, storage_version: finalVersion };
    },
    async readUrl(key: string, version: string) {
      const target = url(key);
      target.searchParams.set('versionId', version);
      target.searchParams.set('X-Amz-Expires', '300');
      const signed = await aws.sign(target.toString(), { method: 'GET', aws: { signQuery: true } });
      return { url: signed.url, expiresAt: new Date(Date.now() + 300_000).toISOString() };
    },
  };
}
