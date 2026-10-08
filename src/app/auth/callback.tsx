import { useEffect, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { EmailFrame } from '@/features/auth/email-frame';
import { completeEmailCallback, completeRecoveryCallback } from '@/features/auth/service';

function CallbackResult({ code, tokenHash, failed }: { code?: string; tokenHash?: string; failed: boolean }) {
  const [state, setState] = useState<'working' | 'success' | 'error'>(failed || (!code && !tokenHash) ? 'error' : 'working');
  useEffect(() => {
    // Remove credentials from browser history without logging the URL.
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(window.history.state, '', window.location.pathname);
    if ((!code && !tokenHash) || failed) return;
    let active = true;
    const completion = tokenHash ? completeRecoveryCallback(tokenHash) : completeEmailCallback(code!);
    void completion.then(kind => {
      if (!active) return;
      if (kind === 'recovery') router.replace('/reset-password');
      else setState('success');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [code, tokenHash, failed]);
  return <EmailFrame title={state === 'working' ? 'Opening your link…' : state === 'success' ? 'Email confirmed.' : 'This link can’t be used.'}>
    <Text>{state === 'working' ? 'Please wait while Penguin securely completes sign-in.' : state === 'success' ? 'Your session is ready.' : 'The link may be expired, already used, or opened on a different device. Request a fresh link and open it on the device where you requested it.'}</Text>
    {state === 'error' ? <>
      <Link href="/check-email" replace asChild><Button><Text>Request verification email</Text></Button></Link>
      <Link href="/forgot-password" replace asChild><Button variant="outline"><Text>Request password reset</Text></Button></Link>
    </> : null}
    {state !== 'working' ? <Link href="/" replace asChild><Button variant="ghost"><Text>Continue to Penguin</Text></Button></Link> : null}
  </EmailFrame>;
}

export default function EmailCallback() {
  const params = useLocalSearchParams<{ code?: string | string[]; token_hash?: string | string[]; type?: string | string[]; error?: string; error_code?: string }>();
  const code = typeof params.code === 'string' ? params.code : undefined;
  const tokenHash = typeof params.token_hash === 'string' && params.type === 'recovery' ? params.token_hash : undefined;
  const failed = Boolean(params.error || params.error_code || (params.token_hash !== undefined && (!tokenHash || code)));
  return <CallbackResult key={`${tokenHash ?? code ?? 'missing'}-${failed}`} code={code} tokenHash={tokenHash} failed={failed} />;
}
