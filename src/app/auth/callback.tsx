import { useEffect, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { MailCheck, MailWarning } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import {
  emailCallbackKey,
  emailCallbackProblemText,
  readEmailCallback,
  type EmailCallbackFailure,
  type EmailCallbackParams,
  type EmailCallbackProblem,
  type EmailCallbackRequest,
} from '@/features/auth/email-callback';
import { EmailFrame } from '@/features/auth/email-frame';
import { useAuth } from '@/features/auth/provider';
import { completeEmailCallback, completeRecoveryCallback } from '@/features/auth/service';

type CallbackState = { status: 'working' } | { status: 'success' } | { status: 'error'; problem: EmailCallbackProblem };

// Takes plain values rather than the request object, so the link is completed once
// per link and not again whenever the route re-renders.
function CallbackResult({ kind, credential, reason }: {
  kind: EmailCallbackRequest['kind'];
  credential: string | null;
  reason: EmailCallbackFailure | null;
}) {
  const { session } = useAuth();
  const [state, setState] = useState<CallbackState>(
    kind === 'failed' || !credential ? { status: 'error', problem: reason ?? 'missing' } : { status: 'working' },
  );
  useEffect(() => {
    // Remove credentials from browser history without logging the URL.
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', window.location.pathname);
    if (kind === 'failed' || !credential) return;
    let active = true;
    const completion = kind === 'recovery-token' ? completeRecoveryCallback(credential) : completeEmailCallback(credential);
    void completion.then(kind => {
      if (!active) return;
      if (kind === 'recovery') router.replace('/reset-password');
      else setState({ status: 'success' });
    }).catch(() => { if (active) setState({ status: 'error', problem: 'exchange' }); });
    return () => { active = false; };
  }, [credential, kind]);
  const failed = state.status === 'error';
  return <EmailFrame icon={failed ? MailWarning : MailCheck} title={state.status === 'working' ? 'Opening your link…' : state.status === 'success' ? 'Email confirmed.' : 'This link can’t be used.'}>
    <Text variant="lead" accessibilityLiveRegion="polite">{state.status === 'working' ? 'Please wait while Penguin securely completes sign-in.'
      : state.status === 'success' ? 'Your session is ready.' : emailCallbackProblemText(state.problem)}</Text>
    {failed ? <>
      {/* The email may already be confirmed even though this link could not sign in. */}
      {session ? null : <Link href="/login" replace asChild><Button><Text>Log in</Text></Button></Link>}
      <Link href="/check-email" replace asChild><Button variant="outline"><Text>Request verification email</Text></Button></Link>
      <Link href="/forgot-password" replace asChild><Button variant="outline"><Text>Request password reset</Text></Button></Link>
    </> : null}
    {state.status !== 'working' ? <Link href="/" replace asChild><Button variant="ghost"><Text>Continue to Penguin</Text></Button></Link> : null}
  </EmailFrame>;
}

export default function EmailCallback() {
  const params = useLocalSearchParams<EmailCallbackParams>();
  const request = readEmailCallback(params);
  return <CallbackResult
    key={emailCallbackKey(request)}
    kind={request.kind}
    credential={request.kind === 'code' ? request.code : request.kind === 'recovery-token' ? request.tokenHash : null}
    reason={request.kind === 'failed' ? request.reason : null}
  />;
}
