import { Stack } from 'expo-router';
import { useSignedMediaCacheOwner } from '@/features/posts/use-signed-media-cache';

export default function ProtectedLayout() {
  useSignedMediaCacheOwner();
  return <Stack screenOptions={{ headerShown: false }}>
    {/* Create is a full-height sheet that slides up above the tabs. Full-screen
        fallback: remove these options (and the sheet's top gap in create-screen.tsx). */}
    <Stack.Screen
      name="create-post"
      options={{ presentation: 'transparentModal', animation: 'slide_from_bottom', contentStyle: { backgroundColor: 'transparent' } }}
    />
    {/* No back swipe: leaving the form asks before discarding what was typed. */}
    <Stack.Screen name="groups/new" options={{ gestureEnabled: false }} />
    <Stack.Screen name="groups/[id]/edit" options={{ gestureEnabled: false }} />
  </Stack>;
}
