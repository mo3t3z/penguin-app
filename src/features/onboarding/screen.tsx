import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, BookOpen, Building2, Compass, GraduationCap, MessagesSquare, Users } from 'lucide-react-native';
import { PenguinMark } from '@/components/brand-mark';
import { InfoRow } from '@/components/forms/info-row';
import { SelectorOption } from '@/components/forms/selector-option';
import { TopBar } from '@/components/navigation/top-bar';
import { IdentityRow } from '@/components/social/identity-row';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Profile, StudyLevel } from '@/lib/database.types';
import { signOut } from '@/features/auth/service';
import { useProfile } from '@/features/profile/provider';
import { checkUsernameAvailability, isValidUsername, normalizeUsername, updateCurrentProfile } from '@/features/profile/service';
import { OnboardingProgress } from './progress';
import { SearchSelection, type Selection } from './search-selection';
import {
  canContinueStep,
  isValidDisplayName,
  onboardingSteps,
  previousStep,
  primaryActionLabel,
  REVIEW_STEP,
  stepRequirementError,
} from './steps';
import { UsernameField } from './username-field';
import { studyLevels } from '@/features/profile/study-levels';

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
  const validName = isValidDisplayName(displayName);
  const selections = { institution, field, level };

  const move = useCallback((next: number) => {
    if (inFlight.current) return;
    Keyboard.dismiss(); setError(null); setStep(next);
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inFlight.current) return true;
      const previous = previousStep(step);
      if (previous !== null) { move(previous); return true; }
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
    const requirement = stepRequirementError(step, selections);
    if (requirement) { setError(requirement); return; }
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

  const previous = previousStep(step);
  const review = step === REVIEW_STEP;
  const previewName = displayName.trim() || 'Penguin student';
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TopBar title={onboardingSteps[step].navTitle} brand={false}
        onBack={previous !== null ? () => move(previous) : undefined} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="grow px-5 pb-8 pt-2">
        <View className="gap-5">
          <OnboardingProgress step={step} />
          {step === 0 ? <PenguinMark size={64} /> : null}
          <View className="gap-2"><Text variant="h2">{onboardingSteps[step].title}</Text><Text variant="lead">{onboardingSteps[step].description}</Text></View>
          {step === 0 ? <Card variant="muted"><CardContent className="gap-4">
            <InfoRow icon={Users} label="Connect" value="Meet students from your campus" />
            <InfoRow icon={MessagesSquare} label="Share" value="Trade questions, ideas, and notes" />
            <InfoRow icon={Compass} label="Belong" value="Be part of a student community" />
          </CardContent></Card> : null}
          {step === 1 ? <View className="gap-5">
            <UserAvatar name={previewName} size="xl" />
            <FormField label="Display name" required value={displayName} onChangeText={setDisplayName} autoComplete="name"
              autoCapitalize="words" maxLength={80} editable={!busy} hint="The name you’d like other students to use. Up to 80 characters." />
            <UsernameField value={username} onChange={setUsername} disabled={busy} />
          </View> : null}
          {step === 2 ? <SearchSelection key="institution" kind="institution" selected={institution} onSelect={setInstitution} /> : null}
          {step === 3 ? <SearchSelection key="field" kind="field" selected={field} onSelect={setField} /> : null}
          {step === 4 ? <View className="gap-3" accessibilityRole="radiogroup">{(Object.entries(studyLevels) as [StudyLevel, string][]).map(([value, label]) =>
            <SelectorOption key={value} icon={GraduationCap} title={label} selected={level === value} onPress={() => setLevel(value)} />)}</View> : null}
          {review ? <Card variant="muted"><CardContent className="gap-4">
            <IdentityRow name={previewName} username={canonical}
              trailing={<Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Edit identity" onPress={() => move(1)}><Text>Edit</Text></Button>} />
            <InfoRow icon={Building2} label="Institution" value={institution?.name ?? 'Not selected'} disabled={busy} onEdit={() => move(2)} />
            <InfoRow icon={BookOpen} label="Field of study" value={field?.name ?? 'Not selected'} disabled={busy} onEdit={() => move(3)} />
            <InfoRow icon={GraduationCap} label="Study level" value={level ? studyLevels[level] : 'Not selected'} disabled={busy} onEdit={() => move(4)} />
          </CardContent></Card> : null}
          {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
          <View className="gap-3">
            <Button loading={busy} disabled={!canContinueStep(step, selections)} onPress={() => void (review ? complete() : next())}>
              {review && !busy ? <Icon as={ArrowRight} size={18} color="primary-foreground" /> : null}
              <Text>{primaryActionLabel(step, busy)}</Text>
            </Button>
            {review ? <Button variant="secondary" disabled={busy} onPress={() => move(1)}><Text>Edit my details</Text></Button> : null}
            <Text variant="caption" className="text-muted-foreground">
              {step === 0 ? 'Takes about a minute. You can edit your profile later.'
                : review ? 'Your profile is saved when you complete this step.' : 'Nothing is saved until you complete your profile.'}
            </Text>
            <Button variant="ghost" disabled={busy} onPress={() => void logout()}><Text>Log out</Text></Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
