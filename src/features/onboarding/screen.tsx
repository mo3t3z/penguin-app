import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GraduationCap } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Profile, StudyLevel } from '@/lib/database.types';
import { signOut } from '@/features/auth/service';
import { useProfile } from '@/features/profile/provider';
import { checkUsernameAvailability, isValidUsername, normalizeUsername, updateCurrentProfile } from '@/features/profile/service';
import { SearchSelection, type Selection } from './search-selection';
import { UsernameField } from './username-field';
import { studyLevels } from '@/features/profile/study-levels';

const steps = [
  { title: 'Your people. Your next chapter.', description: 'Welcome to Penguin. A few details will help you find your place in the student community.' },
  { title: 'Start with you.', description: 'Choose the name your fellow students will see.' },
  { title: 'Where do you study?', description: 'Find your university, school or institute.' },
  { title: 'What are you studying?', description: 'Choose the area closest to your program.' },
  { title: 'Where are you in your journey?', description: 'Choose your current study level.' },
  { title: 'Looks like you.', description: 'One last look before you join Penguin.' },
];

function saveError(cause: unknown) {
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  if (code === '23505') return 'That username was just taken. Go back to Identity and choose another.';
  if (code === '23503') return 'A selected institution or field is no longer available. Please select it again.';
  if (code === '23514' || code === '23502') return 'Some details are incomplete or invalid. Review each step and try again.';
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return 'Your session or profile is no longer available. Log out and sign in again.';
  return 'We couldn’t finish saving your profile. Your details are still here. Check your connection and try again.';
}

export function OnboardingScreen({ profile }: { profile: Profile }) {
  const { refresh } = useProfile();
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [institution, setInstitution] = useState<Selection | null>(null);
  const [field, setField] = useState<Selection | null>(null);
  const [level, setLevel] = useState<StudyLevel | null>(profile.study_level);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const canonical = normalizeUsername(username);
  const validName = [...displayName.trim()].length > 0 && [...displayName.trim()].length <= 80;

  const move = useCallback((next: number) => {
    if (inFlight.current) return;
    Keyboard.dismiss(); setError(null); setStep(next);
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inFlight.current) return true;
      if (step > 0) { move(step - 1); return true; }
      return false;
    });
    return () => listener.remove();
  }, [step, move]));

  async function next() {
    if (inFlight.current) return;
    setError(null);
    if (step === 1) {
      if (!validName || !isValidUsername(canonical)) { setError('Enter a display name (1–80 characters) and a valid username.'); return; }
      inFlight.current = true; setBusy(true);
      try {
        const availability = await checkUsernameAvailability(canonical);
        if (!availability.available) { setError('That username is unavailable. Please choose another.'); return; }
        setUsername(canonical); Keyboard.dismiss(); setStep(2);
      } catch { setError('We couldn’t check your username. Check your connection and retry.'); }
      finally { inFlight.current = false; setBusy(false); }
      return;
    }
    if (step === 2 && !institution) { setError('Select an institution to continue.'); return; }
    if (step === 3 && !field) { setError('Select a field of study to continue.'); return; }
    if (step === 4 && !level) { setError('Select your study level to continue.'); return; }
    move(step + 1);
  }

  async function complete() {
    if (inFlight.current) return;
    if (!validName || !isValidUsername(canonical) || !institution || !field || !level || !(level in studyLevels)) {
      setError('Complete each step before saving your profile.'); return;
    }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const saved = await updateCurrentProfile({ display_name: displayName.trim(), username: canonical,
        institution_id: institution.id, field_id: field.id, study_level: level, onboarding_completed: true });
      if (!saved.onboarding_completed) throw new Error('Profile incomplete');
      const current = await refresh();
      if (!current?.onboarding_completed) throw new Error('Profile refresh incomplete');
      // Root guards remove onboarding from history only after the database-backed refresh.
    } catch (cause) { setError(saveError(cause)); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await signOut(); }
    catch { setError('We couldn’t log out. Please try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  const canContinue = step === 2 ? Boolean(institution) : step === 3 ? Boolean(field) : step === 4 ? Boolean(level) : true;
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="grow p-6">
        <View className="w-full max-w-lg self-center gap-6">
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="small" className="tracking-widest text-primary">PENGUIN</Text>
            <Text variant="muted">{step === 0 ? 'Make yourself at home' : `Step ${step} of 5`}</Text>
          </View>
          <View className="flex-row gap-2" accessible accessibilityRole="progressbar" accessibilityLabel="Profile setup"
            accessibilityValue={{ min: 0, max: 5, now: step }}>
            {steps.slice(1).map((_, index) => <View key={index} className={`h-1 flex-1 rounded-full ${index < step ? 'bg-primary' : 'bg-muted'}`} />)}
          </View>
          <View className="gap-3"><Text variant="h1">{steps[step].title}</Text><Text variant="lead">{steps[step].description}</Text></View>
          {step === 0 ? <Card variant="highlighted"><CardContent className="gap-4">
            <Icon as={GraduationCap} size={32} color="primary" />
            <Text variant="h3">A little about you. A world to explore.</Text>
            <Text>Your name, your campus, your studies. Let’s start there.</Text>
          </CardContent></Card> : null}
          {step === 1 ? <View className="gap-5">
            <FormField label="Display name" required value={displayName} onChangeText={setDisplayName} autoComplete="name"
              autoCapitalize="words" maxLength={80} editable={!busy} hint="The name you’d like other students to use. Up to 80 characters." />
            <UsernameField value={username} onChange={setUsername} disabled={busy} />
          </View> : null}
          {step === 2 ? <SearchSelection key="institution" kind="institution" selected={institution} onSelect={setInstitution} /> : null}
          {step === 3 ? <SearchSelection key="field" kind="field" selected={field} onSelect={setField} /> : null}
          {step === 4 ? <View className="gap-3">{(Object.entries(studyLevels) as [StudyLevel, string][]).map(([value, label]) =>
            <Button key={value} variant={level === value ? 'secondary' : 'outline'} className="justify-start"
              accessibilityState={{ selected: level === value }} onPress={() => setLevel(value)}>
              <Text className="flex-1 shrink">{level === value ? '✓ ' : ''}{label}</Text>
            </Button>)}</View> : null}
          {step === 5 ? <Card><CardContent className="gap-5">
            {[
              { label: 'Identity', value: `${displayName.trim()}\n@${canonical}`, target: 1 },
              { label: 'Institution', value: institution?.name, target: 2 },
              { label: 'Field of study', value: field?.name, target: 3 },
              { label: 'Study level', value: level ? studyLevels[level] : '', target: 4 },
            ].map(row => <View key={row.label} className="gap-1">
              <Text variant="muted">{row.label}</Text><Text>{row.value}</Text>
              <Button variant="link" className="self-start px-0" disabled={busy} onPress={() => move(row.target)}><Text>Edit {row.label.toLowerCase()}</Text></Button>
            </View>)}
          </CardContent></Card> : null}
          {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
          <View className="gap-3">
            <Button size="lg" loading={busy} disabled={!canContinue} onPress={() => void (step === 5 ? complete() : next())}>
              <Text>{busy ? 'Please wait…' : step === 5 ? 'Complete profile' : 'Continue'}</Text>
            </Button>
            {step > 0 ? <Button variant="outline" disabled={busy} onPress={() => move(step - 1)}><Text>Back</Text></Button> : null}
            <Button variant="ghost" disabled={busy} onPress={() => void logout()}><Text>Log out</Text></Button>
            <Text variant="muted">{step === 5 ? 'Your profile is saved when you complete this step.' : 'Nothing is saved until you complete your profile.'}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
