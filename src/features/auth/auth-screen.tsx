import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { Link, router } from 'expo-router';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { PenguinWordmark } from '@/components/penguin-wordmark';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { FormField } from '@/components/ui/form-field';
import { PasswordField } from '@/components/ui/password-field';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { AuthFrame, goBackOr } from './auth-frame';
import { pendingVerificationEmail } from './pending-email';
import { authErrorMessage, signIn, signUp } from './service';
import { confirmationError as confirmationRule, emailError as emailRule, passwordError as passwordRule } from './validation';

// The welcome illustration, smaller, above the login heading.
const welcomePenguin = require('../../../assets/welcome-penguin.webp');
const WELCOME_PENGUIN_ASPECT = 1199 / 1312;

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
  const { scheme } = usePenguinTheme();

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
    {creating ? <View className="gap-2">
      <Text className="text-footnote font-inter-semibold text-primary-text">Welcome to Penguin</Text>
      <Text variant="h2">Your next chapter starts here.</Text>
      <Text variant="lead">Join a community made for students, by students.</Text>
    </View> : <View className="items-center gap-2">
      <PenguinWordmark size="auth" />
      <View className="h-56 w-full items-center justify-center" aria-hidden>
        <View className="absolute size-48 rounded-full bg-info-surface" />
        <Image source={welcomePenguin} style={{ height: 210, width: 210 * WELCOME_PENGUIN_ASPECT }} resizeMode="contain" />
      </View>
      <Text variant="h1" className="text-center font-inter-bold">Welcome back</Text>
      <Text variant="lead" className="text-center">Sign in to continue to Penguin.</Text>
    </View>}
    <FormField label="Email address" hideLabel={!creating} leadingIcon={Mail} placeholder={creating ? 'you@university.edu' : 'you@example.com'} value={email} onChangeText={setEmail}
      keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} required
      error={submitted ? emailError : undefined} />
    <PasswordField label="Password" hideLabel={!creating} leadingIcon={LockKeyhole} placeholder={creating ? 'Create a password' : 'Your password'} value={password} onChangeText={setPassword}
      autoComplete={creating ? 'new-password' : 'current-password'} editable={!busy} required
      error={submitted ? passwordError : undefined}
      hint={creating ? 'At least 8 characters. Additional server rules may apply.' : undefined}
      onSubmitEditing={creating ? undefined : () => void submit()} />
    {creating ? <FormField label="Confirm password" leadingIcon={LockKeyhole} placeholder="Re-enter your password" value={confirmation}
      onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password"
      editable={!busy} required error={submitted ? confirmationError : undefined} onSubmitEditing={() => void submit()} /> : null}
    {!creating && !busy ? <Link href="/forgot-password" asChild>
      <Button variant="link" className="-my-2 self-end px-0"><Text className="font-inter-semibold text-footnote">Forgot password?</Text></Button>
    </Link> : null}
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button loading={busy} onPress={() => void submit()}>
      <Text>{creating ? 'Create account' : 'Sign in'}</Text>
      {creating || busy ? null : <ArrowRight size={20} color={colors[scheme].background} aria-hidden />}
    </Button>
    {!busy ? <View className="items-center gap-1">
      {creating ? <Link href="/login" replace asChild>
        <Button variant="ghost"><Text>Already a member? Log in</Text></Button>
      </Link> : <View className="flex-row items-center">
        <Text variant="muted">{"Don't have an account? "}</Text>
        <Link href="/sign-up" replace asChild>
          <Button variant="link" className="px-0"><Text className="font-inter-semibold">Sign up</Text></Button>
        </Link>
      </View>}
      {!creating ? <Link href="/check-email" asChild><Button variant="ghost"><Text className="text-footnote">Resend verification email</Text></Button></Link> : null}
      {__DEV__ ? <Link href="/gallery" asChild><Button variant="link"><Text>UI foundation</Text></Button></Link> : null}
    </View> : null}
  </AuthFrame>;
}
