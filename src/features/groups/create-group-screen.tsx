import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Text } from '@/components/ui/text';
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_NAME_TAKEN,
  groupCreateErrors,
  groupDescriptionError,
  groupErrorKind,
  groupNameError,
  hasGroupDraft,
  prepareGroupCreateAttempt,
  type GroupCreateAttempt,
} from './groups';
import { createGroup } from './service';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

// Create a group: a name and an optional description, nothing else. There is no
// image because the app has no safe upload path for one yet. The same request
// identifier is reused while the form is unchanged, so a retry after a lost
// response opens the group that was already created instead of making a second.
// Cancel and the system Back ask before discarding what was typed; neither does
// anything while the group is being created. The iOS back swipe is turned off for
// this route in src/app/(protected)/_layout.tsx for the same reason.
export function CreateGroupScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [takenName, setTakenName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  const attempt = useRef<GroupCreateAttempt | null>(null);
  const mounted = useRef(true);
  const draft = hasGroupDraft(name, description);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Field errors appear after the first attempt to create, then follow the typing.
  const nameError = takenName !== null && takenName === name ? GROUP_NAME_TAKEN : submitted ? groupNameError(name) : null;
  const descriptionError = groupDescriptionError(description);
  const descriptionLength = [...description.trim()].length;

  const requestClose = useCallback(() => {
    if (inFlight.current) return;
    if (draftRef.current) { Keyboard.dismiss(); setConfirmDiscard(true); } else leave();
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inFlight.current) return true;
      if (!draftRef.current) return false;
      Keyboard.dismiss();
      setConfirmDiscard(true);
      return true;
    });
    return () => { mounted.current = false; listener.remove(); };
  }, []));

  async function create() {
    if (inFlight.current) return;
    setSubmitted(true);
    if (groupNameError(name) || groupDescriptionError(description)) return;
    const current = prepareGroupCreateAttempt(attempt.current, name, description, Crypto.randomUUID);
    attempt.current = current;
    inFlight.current = true; setBusy(true); setError(null); setTakenName(null);
    Keyboard.dismiss();
    try {
      const groupId = await createGroup(current);
      attempt.current = null;
      // The new group replaces this form, so Back from it returns to Groups.
      if (mounted.current) router.replace({ pathname: '/groups/[id]', params: { id: groupId } });
    } catch (cause) {
      if (!mounted.current) return;
      const kind = groupErrorKind(cause);
      if (kind === 'name-taken') setTakenName(name);
      else setError(groupCreateErrors[kind]);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <View className="h-14 flex-row items-center justify-between px-2">
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <Text className="text-body font-inter-semibold" role="heading">New group</Text>
      </View>
      <Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Cancel creating group" onPress={requestClose}>
        <Text>Cancel</Text>
      </Button>
      <Button size="sm" className="mr-1" loading={busy} accessibilityLabel="Create group" onPress={() => void create()}>
        <Text>{busy ? 'Creating…' : 'Create'}</Text>
      </Button>
    </View>
    {/* The one keyboard strategy, the same as in Create post and a conversation. */}
    <KeyboardAvoidingView className="flex-1" behavior="padding">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerClassName="w-full max-w-xl gap-5 self-center px-5 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <FormField
          label="Group name"
          required
          value={name}
          onChangeText={setName}
          placeholder="For example, Algorithms study group"
          maxLength={GROUP_NAME_MAX}
          editable={!busy}
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="next"
          hint={`${GROUP_NAME_MIN} to ${GROUP_NAME_MAX} characters. Every group name is unique.`}
          error={nameError ?? undefined}
        />
        <FormField
          label="Description (optional)"
          variant="multiline"
          value={description}
          onChangeText={setDescription}
          placeholder="What is this group for?"
          maxLength={GROUP_DESCRIPTION_MAX}
          editable={!busy}
          hint={`${descriptionLength}/${GROUP_DESCRIPTION_MAX}`}
          error={descriptionError ?? undefined}
        />
        <Text variant="caption" className="text-muted-foreground">
          Groups are public: any student can find this group, see its members and join it. You will be its owner.
        </Text>
        {error ? <Text variant="callout" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    <Dialog
      visible={confirmDiscard}
      title="Discard this group?"
      description="The name and description you wrote will be lost."
      onClose={() => setConfirmDiscard(false)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setConfirmDiscard(false)}><Text>Keep editing</Text></Button>
        <Button variant="destructive" size="sm" onPress={() => { setConfirmDiscard(false); leave(); }}><Text>Discard</Text></Button>
      </>}
    />
  </SafeAreaView>;
}
