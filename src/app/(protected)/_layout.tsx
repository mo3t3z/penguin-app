import { Stack } from 'expo-router';
import { useSignedMediaCacheOwner } from '@/features/posts/use-signed-media-cache';

export default function ProtectedLayout() {
  useSignedMediaCacheOwner();
  return <Stack screenOptions={{ headerShown: false }} />;
}
