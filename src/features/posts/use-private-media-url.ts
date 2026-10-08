import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { getPostImageReadUrl } from './media-service';
import {
  isSignedMediaUrlFresh,
  parseSignedMediaUrl,
  RequestGeneration,
  shouldRequestPrivateMedia,
  signedMediaMemoryCache,
  signedMediaRefreshDelay,
  type SignedMediaUrl,
} from './private-media';

type MediaUrlSnapshot = SignedMediaUrl & {
  ownerKey: string;
  error: string | null;
  loading: boolean;
};

function friendlyReadError(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') return null;
  return 'This image could not be loaded. Try again.';
}

export function usePrivateMediaUrl(mediaId: string, visible: boolean) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const ownerKey = userId ? `${userId}:${mediaId}` : null;
  const [snapshot, setSnapshot] = useState<MediaUrlSnapshot | null>(null);
  const snapshotRef = useRef<MediaUrlSnapshot | null>(null);
  const generationRef = useRef(new RequestGeneration());
  const forceRefreshRef = useRef(false);
  const [revision, setRevision] = useState(0);

  const commit = useCallback((next: MediaUrlSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);
  const refresh = useCallback(() => {
    if (!visible || !ownerKey || !userId) return;
    signedMediaMemoryCache.delete(userId, mediaId);
    forceRefreshRef.current = true;
    setRevision((value) => value + 1);
  }, [mediaId, ownerKey, userId, visible]);

  useEffect(() => {
    const requestGeneration = generationRef.current;
    if (!shouldRequestPrivateMedia(visible, userId) || !ownerKey || !userId) {
      requestGeneration.invalidate();
      return;
    }

    const generation = requestGeneration.issue();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const current = snapshotRef.current;
    const local = current?.ownerKey === ownerKey ? current : null;
    const shared = signedMediaMemoryCache.get(userId, mediaId);
    const cached = local ?? (shared ? { ownerKey, ...shared, error: null, loading: false } : null);
    const scheduleRefresh = (value: SignedMediaUrl) => {
      const delay = signedMediaRefreshDelay(value);
      if (delay <= 0) return;
      timer = setTimeout(() => {
        if (!requestGeneration.isCurrent(generation)) return;
        forceRefreshRef.current = true;
        setRevision((value) => value + 1);
      }, delay);
    };

    if (cached && isSignedMediaUrlFresh(cached) && !forceRefreshRef.current) {
      if (current !== cached) commit(cached);
      scheduleRefresh(cached);
      return () => {
        controller.abort();
        if (timer) clearTimeout(timer);
        requestGeneration.invalidate();
      };
    }

    forceRefreshRef.current = false;
    commit({
      ownerKey,
      url: cached?.url ?? '',
      expiresAt: cached?.expiresAt ?? 0,
      error: null,
      loading: true,
    });
    void getPostImageReadUrl(mediaId, { signal: controller.signal }).then((response) => {
      if (!requestGeneration.isCurrent(generation)) return;
      const signed = parseSignedMediaUrl(response);
      signedMediaMemoryCache.set(userId, mediaId, signed);
      commit({ ownerKey, ...signed, error: null, loading: false });
      scheduleRefresh(signed);
    }).catch((error: unknown) => {
      if (!requestGeneration.isCurrent(generation)) return;
      const message = friendlyReadError(error);
      if (!message) return;
      commit({
        ownerKey,
        url: cached?.url ?? '',
        expiresAt: cached?.expiresAt ?? 0,
        error: message,
        loading: false,
      });
    });

    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      requestGeneration.invalidate();
    };
  }, [commit, mediaId, ownerKey, revision, userId, visible]);

  const current = snapshot?.ownerKey === ownerKey ? snapshot : null;
  return {
    url: current?.url || null,
    loading: current?.loading ?? (visible && Boolean(ownerKey)),
    error: current?.error ?? null,
    refresh,
  };
}
