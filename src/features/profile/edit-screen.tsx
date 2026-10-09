import { useCallback, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { BookOpen, Building2, ChevronDown, GraduationCap } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InfoRow } from '@/components/forms/info-row';
import { TopBar } from '@/components/navigation/top-bar';
import { OptionSheet } from '@/components/sheets/option-sheet';
import { SelectorSheet } from '@/components/sheets/selector-sheet';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Profile, StudyLevel } from '@/lib/database.types';
import { UsernameField } from '@/features/onboarding/username-field';
import type { Selection } from '@/features/onboarding/search-selection';
import { BIO_LIMIT, bioCounter, isBioTooLong, profileDisplayName } from './profile-format';
import { useProfile } from './provider';
import { studyLevels } from './study-levels';
import { checkUsernameAvailability, isValidUsername, normalizeUsername, updateCurrentProfile } from './service';
import { useProfileReferences } from './use-references';

const studyLevelOptions = (Object.entries(studyLevels) as [StudyLevel, string][]).map(([value, label]) => ({ value, label }));

function leave() {
  router.dismissTo('/account');
}

// Figma "Edit profile": title bar with back and Save, then a scrolling form.
function Frame({ children, onBack, action }: PropsWithChildren<{ onBack: () => void; action?: ReactNode }>) {
  return <SafeAreaView className="flex-1 bg-background">
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TopBar title="Edit profile" onBack={onBack} actions={action} />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="grow px-5 pb-8 pt-2">
        <View className="gap-5">{children}</View>
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
  const [selector, setSelector] = useState<'institution' | 'field' | 'level' | null>(null);
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
    if (isBioTooLong(bio)) { setError('Keep your bio to 500 characters or fewer.'); return; }
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
      if (mounted.current) leave();
    } catch (cause) {
      if (mounted.current) setError(saved ? 'Your changes were saved, but we couldn’t reload your profile. Check your connection and retry Save.' : friendlyError(cause));
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  // The header Save and the bottom button run the same guarded save.
  const cancel = () => { if (!inFlight.current) leave(); };
  return <Frame onBack={cancel} action={<Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Save changes" onPress={() => void save()}>
    <Text>Save</Text>
  </Button>}>
    <View className="items-center">
      <UserAvatar name={profileDisplayName(displayName)} uri={profile.avatar_url} size="profile" />
    </View>
    <FormField label="Display name" required value={displayName} onChangeText={setDisplayName} maxLength={80}
      autoComplete="name" autoCapitalize="words" editable={!busy} hint="Up to 80 characters." />
    <UsernameField value={username} currentUsername={profile.username} onChange={setUsername} disabled={busy} />
    <FormField label="Bio" variant="multiline" value={bio} onChangeText={setBio} editable={!busy}
      placeholder="Share what you’re studying, curious about or working toward."
      hint={bioCounter(bio)}
      error={isBioTooLong(bio) ? `${bioCounter(bio)}. Keep your bio to ${BIO_LIMIT} characters or fewer.` : undefined} />
    <Separator />
    <View className="gap-3">
      <Text variant="h4" accessibilityRole="header">Student details</Text>
      <InfoRow icon={Building2} label="Institution · Tap to search" value={institution?.name ?? 'Choose an institution'}
        editIcon={ChevronDown} editLabel="Change institution" disabled={busy} onEdit={() => setSelector('institution')} />
      <InfoRow icon={BookOpen} label="Field of study · Tap to search" value={field?.name ?? 'Choose a field of study'}
        editIcon={ChevronDown} editLabel="Change field of study" disabled={busy} onEdit={() => setSelector('field')} />
      <InfoRow icon={GraduationCap} label="Study level" value={level ? studyLevels[level] : 'Choose a study level'}
        editIcon={ChevronDown} editLabel="Change study level" disabled={busy} onEdit={() => setSelector('level')} />
    </View>
    {error ? <Text className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
    <Button loading={busy} onPress={() => void save()}><Text>{busy ? 'Saving changes…' : 'Save changes'}</Text></Button>
    <Button variant="ghost" disabled={busy} onPress={cancel}><Text>Cancel</Text></Button>
    <SelectorSheet kind={selector === 'field' ? 'field' : 'institution'} visible={(selector === 'institution' || selector === 'field') && !busy}
      selected={selector === 'field' ? field : institution} onClose={() => setSelector(null)}
      onConfirm={value => { if (selector === 'field') setField(value); else setInstitution(value); setSelector(null); }} />
    <OptionSheet visible={selector === 'level' && !busy} title="Study level" icon={GraduationCap} options={studyLevelOptions}
      selected={level} onClose={() => setSelector(null)} onConfirm={value => { setLevel(value); setSelector(null); }} />
  </Frame>;
}

export function EditProfileScreen({ profile }: { profile: Profile }) {
  // Keep initial references stable across the successful refresh; never reset a mounted draft.
  const [initial] = useState(profile);
  const references = useProfileReferences(initial.id, initial.institution_id, initial.field_id);
  if (references.loading || references.failed) return <Frame onBack={leave}>
    {references.loading ? <><Text variant="muted">Loading your current details…</Text><Skeleton className="h-12 w-full" /><Skeleton className="h-40 w-full" /></> : <>
      <Text>We couldn’t load your current study details. Retry before editing so nothing is overwritten.</Text>
      <Button onPress={references.retry}><Text>Retry loading details</Text></Button>
    </>}
    <Button variant="ghost" onPress={leave}><Text>Back to profile</Text></Button>
  </Frame>;
  return <EditForm profile={profile} initialInstitution={references.data?.institution ?? null} initialField={references.data?.field ?? null} />;
}
