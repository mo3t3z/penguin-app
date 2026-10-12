import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { ShieldAlert, UsersRound, WifiOff } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopBar } from '@/components/navigation/top-bar';
import { StatePanel } from '@/components/social/state-panel';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_NAME_TAKEN,
  groupAdminErrors,
  groupDescriptionError,
  groupDetailsChanged,
  groupErrorKind,
  groupNameError,
  normalizeGroupDescription,
  normalizeGroupName,
  type GroupSummary,
} from './groups';
import { updateGroupDetails } from './service';
import { useGroupDetails } from './use-groups';

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/groups');
}

function EditForm({ group }: { group: GroupSummary }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [takenName, setTakenName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const changed = groupDetailsChanged(group, name, description);
  const changedRef = useRef(changed);
  useEffect(() => { changedRef.current = changed; }, [changed]);

  const nameError = takenName !== null && takenName === name ? GROUP_NAME_TAKEN : groupNameError(name);
  const descriptionError = groupDescriptionError(description);
  const descriptionLength = [...description.trim()].length;

  const requestClose = useCallback(() => {
    if (inFlight.current) return;
    if (changedRef.current) { Keyboard.dismiss(); setConfirmDiscard(true); } else leave();
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (inFlight.current) return true;
      if (!changedRef.current) return false;
      Keyboard.dismiss();
      setConfirmDiscard(true);
      return true;
    });
    return () => { mounted.current = false; listener.remove(); };
  }, []));

  async function save() {
    if (inFlight.current || !changed || groupNameError(name) || groupDescriptionError(description)) return;
    inFlight.current = true; setBusy(true); setError(null); setTakenName(null);
    Keyboard.dismiss();
    try {
      await updateGroupDetails({ groupId: group.id, name: normalizeGroupName(name), description: normalizeGroupDescription(description) });
      // The group screen underneath reloads when it comes back into view.
      if (mounted.current) leave();
    } catch (cause) {
      if (!mounted.current) return;
      const kind = groupErrorKind(cause);
      if (kind === 'name-taken') setTakenName(name);
      else setError(groupAdminErrors[kind]);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <>
    <View className="h-14 flex-row items-center justify-between px-2">
      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <Text className="text-body font-inter-semibold" role="heading">Edit group</Text>
      </View>
      <Button variant="ghost" size="sm" disabled={busy} accessibilityLabel="Cancel editing group" onPress={requestClose}>
        <Text>Cancel</Text>
      </Button>
      <Button size="sm" className="mr-1" loading={busy} disabled={!changed || Boolean(nameError) || Boolean(descriptionError)}
        accessibilityLabel="Save group" onPress={() => void save()}>
        <Text>{busy ? 'Saving…' : 'Save'}</Text>
      </Button>
    </View>
    {/* The one keyboard strategy, the same as in Create and a conversation. */}
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
          maxLength={GROUP_NAME_MAX}
          editable={!busy}
          autoCapitalize="sentences"
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
          Every member sees the new name and description. The change is recorded in the admin history.
        </Text>
        {error ? <Text variant="callout" className="text-destructive" accessibilityLiveRegion="polite">{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
    <Dialog
      visible={confirmDiscard}
      title="Discard your changes?"
      description="The group keeps its current name and description."
      onClose={() => setConfirmDiscard(false)}
      actions={<>
        <Button variant="outline" size="sm" onPress={() => setConfirmDiscard(false)}><Text>Keep editing</Text></Button>
        <Button variant="destructive" size="sm" onPress={() => { setConfirmDiscard(false); leave(); }}><Text>Discard</Text></Button>
      </>}
    />
  </>;
}

// Edit a group's name and description. Owner only: the database refuses anyone
// else, and this screen says so instead of showing a form that could only fail. The
// same rules as creating a group apply. Save is offered only when something
// changed; Cancel and the system Back ask before discarding a change. The iOS back
// swipe is turned off for this route in src/app/(protected)/_layout.tsx.
export function EditGroupScreen({ groupId }: { groupId: string | null }) {
  const { state, retry } = useGroupDetails(groupId);
  if (state.status === 'ready' && state.details.role === 'owner' && state.details.rolesSupported && state.details.group.status === 'active') {
    return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <EditForm key={state.details.group.id} group={state.details.group} />
    </SafeAreaView>;
  }
  return <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
    <TopBar title="Edit group" onBack={leave} />
    {state.status === 'ready' ? <StatePanel icon={ShieldAlert} title="You can’t edit this group"
      description={state.details.group.status === 'archived' ? 'This group is archived and can’t be changed.' : 'Only the owner can change a group’s name and description.'}
      actionLabel="Go back" onAction={leave} />
      : state.status === 'failed' ? <StatePanel icon={WifiOff} title="Group couldn’t load"
        description="Check your connection and try again." live actionLabel="Try again" onAction={retry} />
        : state.status === 'missing' ? <StatePanel icon={UsersRound} title="Group not found"
          description="This group isn’t available." actionLabel="Go back" onAction={leave} />
          : <View className="gap-4 px-5 pt-4" accessibilityLabel="Loading group" accessibilityState={{ busy: true }}>
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-28 w-full rounded-md" />
          </View>}
  </SafeAreaView>;
}
