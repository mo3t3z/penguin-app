import '../../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PenguinThemeProvider, usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '@/features/auth/provider';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { ProfileProvider, useProfile } from '@/features/profile/provider';
import { getOnboardingDestination } from '@/features/profile/onboarding';

function Navigation() {
  const { scheme } = usePenguinTheme();
  const { session, loading, error, retry, recovery } = useAuth();
  const { state } = useProfile();
  const destination = getOnboardingDestination(session?.user.id ?? null, state);
  if (loading || error) return <View className="flex-1 justify-center gap-4 bg-background p-6">
    <Text>{loading ? 'Restoring your session…' : error}</Text>
    {error ? <Button onPress={retry}><Text>Retry</Text></Button> : null}
  </View>;
  return <>
    <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors[scheme].background } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}><Stack.Screen name="(public)" /></Stack.Protected>
      <Stack.Protected guard={destination === 'main' && !recovery}><Stack.Screen name="(protected)" /></Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !recovery && destination !== 'main'}><Stack.Screen name="onboarding" /></Stack.Protected>
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="check-email" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="gallery" />
      <Stack.Screen name="+not-found" />
    </Stack>
  </>;
}

export default function RootLayout() {
  return <SafeAreaProvider><PenguinThemeProvider><AuthProvider><ProfileProvider><Navigation /></ProfileProvider></AuthProvider></PenguinThemeProvider></SafeAreaProvider>;
}

