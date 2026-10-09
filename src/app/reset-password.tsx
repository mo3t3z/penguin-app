import { useEffect, useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { KeyRound, LockKeyhole } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { PasswordField } from '@/components/ui/password-field';
import { Text } from '@/components/ui/text';
import { EmailFrame } from '@/features/auth/email-frame';
import { useAuth } from '@/features/auth/provider';
import { authErrorMessage, updateRecoveredPassword, signOut } from '@/features/auth/service';
import { confirmationError, MIN_PASSWORD_LENGTH } from '@/features/auth/validation';

export default function ResetPassword() {
  const { session, recovery, finishRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!recovery) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, recovery.expiresAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [recovery]);
  const allowed = Boolean(session && recovery?.userId === session.user.id && recovery.expiresAt > now);
  async function submit() {
    if (inFlight.current) return;
    if (!allowed || !recovery || recovery.expiresAt <= Date.now()) { setError('This recovery session has expired. Request a new link.'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { setError('Use at least 8 characters.'); return; }
    if (confirmationError(password, confirmation)) { setError('Passwords do not match.'); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try { await updateRecoveredPassword(password); setPassword(''); setConfirmation(''); setSuccess(true); finishRecovery(); }
    catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { if (session) await signOut(); finishRecovery(); router.replace('/forgot-password'); }
    catch (cause) { setError(authErrorMessage(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <EmailFrame navTitle="Reset password" icon={KeyRound} title={success ? 'Password updated.' : allowed ? 'Choose a new password.' : 'Request a new reset link.'}>
    {success ? <>
      <Text variant="lead">Your new password is ready. You can continue to your account.</Text>
      <Link href="/" replace asChild><Button><Text>Continue</Text></Button></Link>
    </> : <>
      {allowed ? <>
        <PasswordField label="New password" placeholder="Create a password" autoComplete="new-password" value={password} onChangeText={setPassword} editable={!busy} hint="At least 8 characters. Additional server rules may apply." />
        <FormField label="Confirm new password" leadingIcon={LockKeyhole} placeholder="Re-enter your password" secureTextEntry autoComplete="new-password" autoCapitalize="none" autoCorrect={false} value={confirmation} onChangeText={setConfirmation} editable={!busy} />
        <Button loading={busy} onPress={() => void submit()}><Text>Update password</Text></Button>
      </> : <Text variant="lead">Your recovery link is missing, expired, or no longer active. For your security, request a fresh link.</Text>}
      <Button variant="ghost" disabled={busy} onPress={() => void cancel()}><Text>Cancel and request a new link</Text></Button>
    </>}
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
  </EmailFrame>;
}
