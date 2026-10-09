import { useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';

// Metro eliminates the gallery module from release builds.
// A static import would retain the developer-only component graph.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Gallery = __DEV__ ? require('../dev/component-gallery').default : null;
export default function GalleryRoute() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  // The gallery sits outside the auth guards, so it can be left in the stack under
  // the signed-out screens. When login or logout removes those, it must hand over
  // to the normal destination instead of becoming the visible screen.
  const [openedAs] = useState(userId);
  if (!Gallery || openedAs !== userId) return <Redirect href="/" />;
  return <Gallery />;
}
