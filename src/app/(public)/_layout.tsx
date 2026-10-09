import { Stack } from 'expo-router';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';

// A stack so Log in and Sign up can go back to Welcome.
export default function PublicLayout() {
  const { scheme } = usePenguinTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors[scheme].background } }} />;
}
