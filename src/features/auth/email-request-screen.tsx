import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { KeyRound, Mail, MailCheck } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import { goBackOr } from './auth-frame';
import { EmailFrame } from './email-frame';
import { pendingVerificationEmail } from './pending-email';
import { authErrorMessage, requestPasswordRecovery, resendVerification } from './service';
import { isValidEmail } from './validation';

export function EmailRequestScreen({ recovery = false }: { recovery?: boolean }) {
  // After sign-up the address is known, so the screen shows it instead of asking
  // again. Opened any other way it falls back to manual entry.
  const [knownEmail, setKnownEmail] = useState(() => recovery ? null : pendingVerificationEmail.get());
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current || cooldown) return;
    const target = knownEmail ?? email;
    if (!isValidEmail(target)) { setError('Enter a valid email address.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (recovery) await requestPasswordRecovery(target);
      else await resendVerification(target);
      setSent(true); setCooldown(true);
      setTimeout(() => setCooldown(false), 60_000);
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function enterDifferentEmail() {
    pendingVerificationEmail.clear();
    setKnownEmail(null); setSent(false); setError(null);
  }
  const submitLabel = cooldown ? 'Wait a minute before retrying' : recovery ? 'Send reset link' : 'Resend verification email';
  return <EmailFrame
    navTitle={recovery ? 'Reset password' : 'Verify email'}
    icon={recovery ? KeyRound : MailCheck}
    onBack={() => goBackOr('/')}
    title={recovery ? sent ? 'Check your email.' : 'Forgot your password?' : 'Check your inbox.'}
  >
    <Text variant="lead">{recovery
      ? sent ? 'If an account exists for that address, you may receive a reset link. Check your inbox and spam folder. If no email arrives, wait a minute and try again.' : 'Enter your email to request a password reset link.'
      : knownEmail
        ? 'We sent a verification link to your email. Open it on this device to continue.'
        : 'If your registration needs confirmation, open the latest Penguin email on this device to continue. You can request another verification email below.'}</Text>
    {knownEmail
      ? <Card variant="muted"><CardContent><Text variant="large" selectable>{knownEmail}</Text></CardContent></Card>
      : <FormField label="Email address" leadingIcon={Mail} placeholder="you@university.edu" value={email} onChangeText={setEmail}
        keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} editable={!busy} required />}
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    {sent && !recovery ? <Text accessibilityLiveRegion="polite">If confirmation is available for this address, a verification email will be sent.</Text> : null}
    <Button variant={knownEmail ? 'secondary' : 'default'} loading={busy} disabled={cooldown} onPress={() => void submit()}><Text>{submitLabel}</Text></Button>
    {!recovery ? <Text variant="caption" className="text-muted-foreground">
      Nothing in your inbox? Check your spam folder. You can resend a new link if the first one expires.
    </Text> : null}
    <View className="items-center">
      {knownEmail ? <Button variant="ghost" disabled={busy} onPress={enterDifferentEmail}><Text>Use a different email</Text></Button> : null}
      <Button variant="ghost" onPress={() => router.replace('/')}><Text>Back to Penguin</Text></Button>
    </View>
  </EmailFrame>;
}
