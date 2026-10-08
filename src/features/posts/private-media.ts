export type SignedMediaUrl = {
  url: string;
  expiresAt: number;
};

type PositionedMedia = {
  id: string;
  position: number;
  status: string;
};

export function parseSignedMediaUrl(
  value: { url: string; expiresAt: string },
  now = Date.now(),
): SignedMediaUrl {
  const expiresAt = Date.parse(value.expiresAt);
  let protocol = '';
  try { protocol = new URL(value.url).protocol; }
  catch { throw new Error('Media service returned an invalid image URL.'); }
  if (protocol !== 'https:' || !Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error('Media service returned an invalid image URL.');
  }
  return { url: value.url, expiresAt };
}

export function signedMediaRefreshDelay(
  value: Pick<SignedMediaUrl, 'expiresAt'>,
  now = Date.now(),
) {
  return Math.max(0, value.expiresAt - now);
}

export function isSignedMediaUrlFresh(
  value: Pick<SignedMediaUrl, 'expiresAt'>,
  now = Date.now(),
) {
  return value.expiresAt > now;
}

export class SignedMediaMemoryCache {
  private activeUserId: string | null = null;
  private entries = new Map<string, SignedMediaUrl>();
  private readonly maxEntries: number;

  constructor(maxEntries = 120) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('Media cache capacity must be a positive integer.');
    }
    this.maxEntries = maxEntries;
  }

  activateUser(userId: string | null) {
    if (this.activeUserId === userId) return;
    this.entries.clear();
    this.activeUserId = userId;
  }

  get(userId: string, mediaId: string, now = Date.now()) {
    if (this.activeUserId !== userId) return null;
    const key = `${userId}:${mediaId}`;
    const value = this.entries.get(key) ?? null;
    if (value && isSignedMediaUrlFresh(value, now)) {
      this.entries.delete(key);
      this.entries.set(key, value);
      return value;
    }
    if (value) this.entries.delete(key);
    return null;
  }

  set(userId: string, mediaId: string, value: SignedMediaUrl) {
    if (this.activeUserId !== userId) return;
    const key = `${userId}:${mediaId}`;
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.entries.delete(oldest);
    }
  }

  delete(userId: string, mediaId: string) {
    this.entries.delete(`${userId}:${mediaId}`);
  }
}

export const signedMediaMemoryCache = new SignedMediaMemoryCache();

export function shouldRequestPrivateMedia(visible: boolean, userId: string | null) {
  return visible && Boolean(userId);
}

export function orderReadyMedia<T extends PositionedMedia>(media: readonly T[]) {
  return media
    .filter((item) => item.status === 'ready')
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

export class RequestGeneration {
  private generation = 0;

  issue() {
    this.generation += 1;
    return this.generation;
  }

  invalidate() {
    this.generation += 1;
  }

  isCurrent(value: number) {
    return this.generation === value;
  }
}
