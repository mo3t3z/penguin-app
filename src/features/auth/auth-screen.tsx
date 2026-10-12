import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Link, router } from 'expo-router';
import { LockKeyhole, Mail } from 'lucide-react-native';
import { PenguinWordmark } from '@/components/penguin-wordmark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '@/components/ui/form-field';
import { PasswordField } from '@/components/ui/password-field';
import { AuthFrame, goBackOr } from './auth-frame';
import { pendingVerificationEmail } from './pending-email';
import { authErrorMessage, signIn, signUp } from './service';
import { confirmationError as confirmationRule, emailError as emailRule, passwordError as passwordRule } from './validation';

export function AuthScreen({ mode }: { mode: 'login' | 'signup' }) {
  const creating = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const emailError = emailRule(email);
  const passwordError = passwordRule(password, creating);
  const confirmationError = creating ? confirmationRule(password, confirmation) : undefined;

  async function submit() {
    if (inFlight.current) return;
    setSubmitted(true); setError(null);
    if (emailError || passwordError || confirmationError) return;
    inFlight.current = true; setBusy(true);
    try {
      if (creating) {
        const result = await signUp(email, password);
        if (!result.hasSession) {
          pendingVerificationEmail.set(email);
          router.replace('/check-email');
        }
      } else await signIn(email, password);
      setPassword(''); setConfirmation('');
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <AuthFrame onBack={() => goBackOr('/welcome')}>
    <View className="gap-2">
      {creating
        ? <Text className="text-footnote font-inter-semibold text-primary-text">Welcome to Penguin</Text>
        : <View className="pb-2"><PenguinWordmark size="auth" /></View>}
      <Text variant="h2">{creating ? 'Your next chapter starts here.' : 'Good to see you.'}</Text>
      <Text variant="lead">{creating ? 'Join a community made for students, by students.' : 'Your student community is right here.'}</Text>
    </View>
    <FormField label="Email address" leadingIcon={Mail} placeholder="you@university.edu" value={email} onChangeText={setEmail}
      keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} required
      error={submitted ? emailError : undefined} />
    <PasswordField label="Password" placeholder={creating ? 'Create a password' : 'Enter your password'} value={password} onChangeText={setPassword}
      autoComplete={creating ? 'new-password' : 'current-password'} editable={!busy} required
      error={submitted ? passwordError : undefined}
      hint={creating ? 'At least 8 characters. Additional server rules may apply.' : undefined}
      onSubmitEditing={creating ? undefined : () => void submit()} />
    {creating ? <FormField label="Confirm password" leadingIcon={LockKeyhole} placeholder="Re-enter your password" value={confirmation}
      onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
      editable={!busy} required error={submitted ? confirmationError : undefined} onSubmitEditing={() => void submit()} /> : null}
    {!creating && !busy ? <Link href="/forgot-password" asChild>
      <Button variant="link" className="-my-2 self-end px-0"><Text className="text-footnote">Forgot password?</Text></Button>
    </Link> : null}
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button loading={busy} onPress={() => void submit()}><Text>{creating ? 'Create account' : 'Log in'}</Text></Button>
    {!busy ? <View className="items-center gap-1">
      {!creating ? <Text variant="muted">New to Penguin?</Text> : null}
      <Link href={creating ? '/login' : '/sign-up'} replace asChild>
        <Button variant="ghost"><Text>{creating ? 'Already a member? Log in' : 'Create an account'}</Text></Button>
      </Link>
      {!creating ? <Link href="/check-email" asChild><Button variant="ghost"><Text>Resend verification email</Text></Button></Link> : null}
      {__DEV__ ? <Link href="/gallery" asChild><Button variant="link"><Text>UI foundation</Text></Button></Link> : null}
    </View> : null}
  </AuthFrame>;
}
