import { useCallback, useRef, useState, type PropsWithChildren } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Profile, StudyLevel } from '@/lib/database.types';
import { UsernameField } from '@/features/onboarding/username-field';
import { SearchSelection, type Selection } from '@/features/onboarding/search-selection';
import { useProfile } from './provider';
import { studyLevels } from './study-levels';
import { checkUsernameAvailability, isValidUsername, normalizeUsername, updateCurrentProfile } from './service';
import { useProfileReferences } from './use-references';

function Frame({ children }: PropsWithChildren) {
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="grow p-6">
        <View className="w-full max-w-lg self-center gap-6"><Text variant="h1">Edit your profile.</Text>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function friendlyError(cause: unknown) {
  const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  if (code === '23505') return 'That username was just taken. Choose another and try again.';
  if (code === '23503') return 'Your institution or field is no longer available. Please select it again.';
  if (code === '23514' || code === '23502') return 'Some details are invalid. Check your name, bio and study selections.';
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST116') return 'Your session or profile is unavailable. Return to your profile and sign in again.';
  return 'We couldn’t save your changes. Check your connection and try again. Your edits are still here.';
}

function EditForm({ profile, initialInstitution, initialField }: {
  profile: Profile; initialInstitution: Selection | null; initialField: Selection | null;
}) {
  const { refresh } = useProfile();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [institution, setInstitution] = useState(initialInstitution);
  const [field, setField] = useState(initialField);
  const [level, setLevel] = useState<StudyLevel | null>(profile.study_level);
  const [selector, setSelector] = useState<'institution' | 'field' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => inFlight.current);
    return () => { mounted.current = false; listener.remove(); };
  }, []));

  async function save() {
    if (inFlight.current) return;
    setError(null);
    const name = displayName.trim();
    const canonical = normalizeUsername(username);
    if ([...name].length < 1 || [...name].length > 80) { setError('Use a display name between 1 and 80 characters.'); return; }
    if (!isValidUsername(canonical)) { setError('Use a valid username: 3–30 letters, numbers or underscores.'); return; }
    if ([...bio].length > 500) { setError('Keep your bio to 500 characters or fewer.'); return; }
    if (!institution || !field) { setError('Select an institution and field of study.'); return; }
    if (!level || !Object.hasOwn(studyLevels, level)) { setError('Select a valid study level.'); return; }
    inFlight.current = true; setBusy(true);
    let saved = false;
    try {
      if (canonical !== normalizeUsername(profile.username ?? '')) {
        let available: boolean;
        try { available = (await checkUsernameAvailability(canonical)).available; }
        catch { setError('We couldn’t check your username. Check your connection and try again.'); return; }
        if (!available) { setError('That username is already taken. Try another.'); return; }
      }
      if (!mounted.current) return;
      const updated = await updateCurrentProfile({ display_name: name, username: canonical, bio: bio.trim() || null,
        institution_id: institution.id, field_id: field.id, study_level: level });
      saved = true;
      const current = await refresh();
      if (!current || current.id !== updated.id) throw new Error('Refresh incomplete');
      if (mounted.current) router.replace('/account');
    } catch (cause) {
      if (mounted.current) setError(saved ? 'Your changes were saved, but we couldn’t reload your profile. Check your connection and retry Save.' : friendlyError(cause));
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  return <Frame>
    <Text variant="lead">Keep your student story up to date.</Text>
    <FormField label="Display name" required value={displayName} onChangeText={setDisplayName} maxLength={80}
      autoComplete="name" autoCapitalize="words" editable={!busy} hint="Up to 80 characters." />
    <UsernameField value={username} currentUsername={profile.username} onChange={setUsername} disabled={busy} />
    <FormField label="Bio" variant="multiline" value={bio} onChangeText={setBio} editable={!busy}
      hint={`${[...bio].length}/500 characters. Share what you’re studying, curious about or working toward.`}
      error={[...bio].length > 500 ? 'Keep your bio to 500 characters or fewer.' : undefined} />
    <Card><CardContent className="gap-4">
      <Text variant="h3">Your studies</Text>
      <Text variant="muted">Institution</Text><Text>{institution?.name ?? 'Choose an institution'}</Text>
      <Button variant="outline" disabled={busy} onPress={() => setSelector(selector === 'institution' ? null : 'institution')}><Text>{selector === 'institution' ? 'Close institution search' : 'Change institution'}</Text></Button>
      {selector === 'institution' ? <SearchSelection kind="institution" selected={institution} disabled={busy} onSelect={value => { setInstitution(value); setSelector(null); }} /> : null}
      <Text variant="muted">Field of study</Text><Text>{field?.name ?? 'Choose a field of study'}</Text>
      <Button variant="outline" disabled={busy} onPress={() => setSelector(selector === 'field' ? null : 'field')}><Text>{selector === 'field' ? 'Close field search' : 'Change field of study'}</Text></Button>
      {selector === 'field' ? <SearchSelection kind="field" selected={field} disabled={busy} onSelect={value => { setField(value); setSelector(null); }} /> : null}
      <Text variant="small">Study level *</Text>
      {(Object.entries(studyLevels) as [StudyLevel, string][]).map(([value, label]) => <Button key={value}
        disabled={busy} className="justify-start" variant={level === value ? 'secondary' : 'outline'}
        accessibilityState={{ selected: level === value }} onPress={() => setLevel(value)}>
        <Text className="flex-1 shrink">{level === value ? '✓ ' : ''}{label}</Text>
      </Button>)}
    </CardContent></Card>
    <Text variant="muted">Profile photos will be available in a later update.</Text>
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button loading={busy} onPress={() => void save()}><Text>{busy ? 'Saving changes…' : 'Save changes'}</Text></Button>
    <Button variant="ghost" disabled={busy} onPress={() => router.replace('/account')}><Text>Cancel</Text></Button>
  </Frame>;
}

export function EditProfileScreen({ profile }: { profile: Profile }) {
  // Keep initial references stable across the successful refresh; never reset a mounted draft.
  const [initial] = useState(profile);
  const references = useProfileReferences(initial.id, initial.institution_id, initial.field_id);
  if (references.loading || references.failed) return <Frame>
    {references.loading ? <><Text>Loading your current details…</Text><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></> : <>
      <Text>We couldn’t load your current study details. Retry before editing so nothing is overwritten.</Text>
      <Button onPress={references.retry}><Text>Retry loading details</Text></Button>
    </>}
    <Button variant="ghost" onPress={() => router.replace('/account')}><Text>Back to profile</Text></Button>
  </Frame>;
  return <EditForm profile={profile} initialInstitution={references.data?.institution ?? null} initialField={references.data?.field ?? null} />;
}
