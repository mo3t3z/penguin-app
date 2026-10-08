export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type ImageMime = keyof typeof IMAGE_TYPES;
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid identifier.');
  }
  return value.toLowerCase();
}
export function imageMime(value: unknown): ImageMime {
  if (typeof value !== 'string' || !Object.hasOwn(IMAGE_TYPES, value)) throw new HttpError(400, 'Use JPEG, PNG or WebP.');
  return value as ImageMime;
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new HttpError(400, 'Invalid size or position.');
  return value;
}
export async function readLimited(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!body) throw new HttpError(400, 'Missing request body.');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new HttpError(413, 'Body exceeds the permitted size.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

// Header validation foundation, not a full decoder or malware scanner. Headers
// beyond the bounded 64 KiB prefix are deliberately rejected, not guessed.
export function inspectImage(bytes: Uint8Array, totalBytes: number): { mime: ImageMime; width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, count: number) => String.fromCharCode(...bytes.subarray(start, start + count));
  const result = (mime: ImageMime, width: number, height: number) => {
    if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32_000_000) {
      throw new HttpError(400, 'Image dimensions exceed the 8192-side / 32-megapixel limit.');
    }
    return { mime, width, height };
  };
  if (bytes.length >= 33 && bytes[0] === 137 && text(1, 7) === 'PNG\r\n\x1a\n' && view.getUint32(8) === 13 && text(12, 4) === 'IHDR') {
    const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) throw new HttpError(400, 'Invalid PNG header.');
    return result('image/png', view.getUint32(16), view.getUint32(20));
  }
  if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === totalBytes) {
    const kind = text(12, 4);
    const chunkSize = view.getUint32(16, true);
    if (chunkSize + 20 > totalBytes) throw new HttpError(400, 'Truncated WebP.');
    if (kind === 'VP8X' && chunkSize === 10) {
      if (bytes[20] & 2) throw new HttpError(400, 'Animated WebP is not supported yet.');
      const le24 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
      return result('image/webp', le24(24) + 1, le24(27) + 1);
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return result('image/webp', view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return result('image/webp', (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i++] !== 0xff) break;
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > bytes.length) break;
      const length = view.getUint16(i);
      if (length < 2 || i + length > bytes.length) break;
      // Baseline and progressive JPEG, not uncommon/unsupported arithmetic modes.
      if ((marker === 0xc0 || marker === 0xc2) && length >= 8 && bytes[i + 2] === 8) {
        return result('image/jpeg', view.getUint16(i + 5), view.getUint16(i + 3));
      }
      i += length;
    }
  }
  throw new HttpError(400, 'Invalid, unsupported or oversized image header.');
}
