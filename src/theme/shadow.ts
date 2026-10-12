import { Platform, type ViewStyle } from 'react-native';
import { shadows } from './tokens';

// The style for a floating layer's shadow: `elevation` on Android, the design
// system's box shadow everywhere else.
export function shadowStyle(name: keyof typeof shadows, scheme: 'light' | 'dark'): ViewStyle {
  const shadow = shadows[name];
  return Platform.OS === 'android' ? { elevation: shadow.elevation } : { boxShadow: shadow[scheme] };
}
