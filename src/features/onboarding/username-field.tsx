import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AtSign } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import { checkUsernameAvailability, isValidUsername, normalizeUsername } from '@/features/profile/service';

export function UsernameField({ value, onChange, disabled, currentUsername }: { value: string; onChange: (value: string) => void; disabled?: boolean; currentUsername?: string | null }) {
  const username = normalizeUsername(value);
  const unchanged = Boolean(currentUsername) && username === normalizeUsername(currentUsername ?? '');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ username: string; status: 'available' | 'unavailable' | 'error' } | null>(null);
  const status = !username ? 'idle' : !isValidUsername(username) ? 'invalid' : unchanged ? 'available' : result?.username === username ? result.status : 'checking';
  useEffect(() => {
    if (!isValidUsername(username) || unchanged) return;
    let active = true;
    const timer = setTimeout(() => {
      void checkUsernameAvailability(username).then(value => {
        if (active) setResult({ username, status: value.available ? 'available' : 'unavailable' });
      }).catch(() => { if (active) setResult({ username, status: 'error' }); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [username, attempt, unchanged]);
  const messages = {
    idle: 'Your name around campus. You can check availability as you type.',
    checking: 'Checking availability…', available: unchanged ? 'This is your current username.' : 'Looks available. It’s reserved only when you save your profile.',
    unavailable: 'That username is taken. Try another.', invalid: 'Use 3–30 lowercase letters, numbers or underscores. Start with a letter or number.',
    error: 'We couldn’t check right now. Check your connection and retry.',
  };
  return <View className="gap-[7px]">
    <FormField label="Username" required leadingIcon={AtSign} value={value} onChangeText={next => { setResult(null); onChange(next.toLowerCase()); }}
      autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={30} editable={!disabled}
      hint="3–30 letters, numbers or underscores. No spaces." error={status === 'invalid' || status === 'unavailable' ? messages[status] : undefined} />
    {status === 'invalid' || status === 'unavailable' ? null
      : <Text variant="caption" accessibilityLiveRegion="polite" className={status === 'available' ? 'text-primary' : 'text-muted-foreground'}>{messages[status]}</Text>}
    {status === 'error' ? <Button variant="ghost" disabled={disabled} onPress={() => { setResult(null); setAttempt(value => value + 1); }}><Text>Retry username check</Text></Button> : null}
  </View>;
}
