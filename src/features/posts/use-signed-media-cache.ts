import { useEffect } from 'react';
import { useAuth } from '@/features/auth/provider';
import { signedMediaMemoryCache } from './private-media';

// Owns the signed-URL cache for the whole signed-in area. Feed lists on Home, the
// Profile tab and student profiles share it, so mounting or unmounting any one of
// them never clears URLs another is showing. Switching account or signing out
// still empties it.
export function useSignedMediaCacheOwner() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  useEffect(() => {
    signedMediaMemoryCache.activateUser(userId);
    return () => signedMediaMemoryCache.activateUser(null);
  }, [userId]);
}
