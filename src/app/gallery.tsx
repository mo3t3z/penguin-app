import { Redirect } from 'expo-router';

// Metro eliminates the gallery module from release builds.
// A static import would retain the developer-only component graph.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Gallery = __DEV__ ? require('../dev/component-gallery').default : null;
export default function GalleryRoute() {
  return Gallery ? <Gallery /> : <Redirect href="/" />;
}

