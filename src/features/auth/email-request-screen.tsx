import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import { EmailFrame } from './email-frame';
import { authErrorMessage, requestPasswordRecovery, resendVerification } from './service';

export function EmailRequestScreen({ recovery = false }: { recovery?: boolean }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current || cooldown) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (recovery) await requestPasswordRecovery(email);
      else await resendVerification(email);
      setSent(true); setCooldown(true);
      setTimeout(() => setCooldown(false), 60_000);
    } catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <EmailFrame title={recovery ? sent ? 'Check your email.' : 'Forgot your password?' : 'Check your email.'}>
    <Text>{recovery
      ? sent ? 'If an account exists for that address, you may receive a reset link. Check your inbox and spam folder. If no email arrives, wait a minute and try again.' : 'Enter your email to request a password reset link.'
      : 'If your registration needs confirmation, open the latest Penguin email on this device to continue. You can request another verification email below.'}</Text>
    <FormField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} editable={!busy} required />
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    {sent && !recovery ? <Text accessibilityLiveRegion="polite">If confirmation is available for this address, a verification email will be sent.</Text> : null}
    <Button loading={busy} disabled={cooldown} onPress={() => void submit()}><Text>{cooldown ? 'Wait a minute before retrying' : recovery ? 'Send reset link' : 'Resend verification email'}</Text></Button>
    <Link href="/" replace asChild><Button variant="ghost"><Text>Back to Penguin</Text></Button></Link>
  </EmailFrame>;
}
