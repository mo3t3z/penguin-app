import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '@/components/ui/form-field';
import { authErrorMessage, signIn, signUp } from './service';

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const creating = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? undefined : 'Enter a valid email address.';
  const passwordError = !password ? 'Enter your password.' : creating && password.length < 8 ? 'Use at least 8 characters.' : undefined;

  async function submit() {
    if (inFlight.current) return;
    setSubmitted(true); setError(null);
    if (emailError || passwordError) return;
    inFlight.current = true; setBusy(true);
    try {
      if (creating) {
        const result = await signUp(email, password);
        if (!result.hasSession) router.replace('/check-email');
      } else await signIn(email, password);
      setPassword('');
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="grow justify-center p-6">
        <View className="w-full max-w-lg self-center gap-6">
          <Text variant="muted">PENGUIN</Text>
          <Text variant="h1">{creating ? 'Your next chapter.' : 'Welcome back.'}</Text>
          <Text variant="lead">{creating ? 'Create your Penguin account.' : 'Sign in to Penguin.'}</Text>
          <FormField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} required error={submitted ? emailError : undefined} />
          <FormField label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} editable={!busy} required error={submitted ? passwordError : undefined} hint={creating ? 'At least 8 characters. Additional server rules may apply.' : undefined} onSubmitEditing={() => void submit()} />
          {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button loading={busy} onPress={() => void submit()}><Text>{creating ? 'Create account' : 'Log in'}</Text></Button>
          {!creating && !busy ? <>
            <Link href="/forgot-password" asChild><Button variant="link"><Text>Forgot password?</Text></Button></Link>
            <Link href="/check-email" asChild><Button variant="link"><Text>Resend verification</Text></Button></Link>
          </> : null}
          {!busy ? <Link href={creating ? '/login' : '/sign-up'} asChild><Button variant="ghost"><Text>{creating ? 'Already have an account? Log in' : 'New here? Create an account'}</Text></Button></Link> : null}
          {__DEV__ && !busy ? <Link href="/gallery" asChild><Button variant="link"><Text>UI foundation</Text></Button></Link> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
