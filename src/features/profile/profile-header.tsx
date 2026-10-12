import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { GraduationCap } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Field, Institution } from '@/lib/database.types';
import { profileDisplayName } from './profile-format';
import type { PublicProfile } from './service';
import { studyLevels } from './study-levels';

export type ProfileStudyDetails = {
  loading: boolean;
  failed: boolean;
  institution: Institution | null;
  field: Field | null;
  retry: () => void;
};

// The identity block at the top of a profile, centred: 96px portrait, name,
// username, one study line ("Institution · Field · Level"), the bio in full and one
// full-width primary action. `actions` is that button: Edit profile on your own
// profile, Message on another student's. Log out is never here; it lives in the
// More options menu.
export function ProfileHeader({ profile, studies, own, actions }: {
  profile: PublicProfile;
  studies: ProfileStudyDetails;
  own: boolean;
  actions?: ReactNode;
}) {
  const name = profileDisplayName(profile.display_name);
  const bio = profile.bio?.trim();
  const level = profile.study_level ? studyLevels[profile.study_level] : null;
  const study = [studies.institution?.name?.trim(), studies.field?.name?.trim(), level].filter(Boolean).join(' · ');
  return <View className="items-center gap-3 px-6 pb-6 pt-2">
    <UserAvatar name={name} uri={profile.avatar_url} size="xl" />
    <View className="items-center">
      <Text variant="h2" className="text-center" accessibilityRole="header">{name}</Text>
      {profile.username ? <Text variant="callout" className="text-muted-foreground">@{profile.username}</Text> : null}
    </View>
    {studies.loading ? <View className="items-center gap-2" accessibilityLabel="Loading study details" accessibilityState={{ busy: true }}>
      <Skeleton className="h-3 w-56 rounded-full" />
      <Skeleton className="h-3 w-40 rounded-full" />
    </View> : studies.failed ? <View className="flex-row flex-wrap items-center justify-center gap-x-2">
      <Text variant="callout" className="text-muted-foreground" accessibilityLiveRegion="polite">Study details couldn’t load.</Text>
      <Button variant="link" className="px-0" accessibilityLabel="Retry study details" onPress={studies.retry}><Text>Retry</Text></Button>
    </View> : study ? <View className="flex-row justify-center gap-1.5">
      <View className="pt-0.5"><Icon as={GraduationCap} size={16} color="muted-foreground" /></View>
      <Text variant="callout" className="shrink text-center">{study}</Text>
    </View> : null}
    {bio ? <Text selectable className="max-w-xs text-center">{bio}</Text>
      : own ? <Link href="/edit-profile" asChild>
        <Text className="max-w-xs text-center text-muted-foreground" role="link">
          A few words can start a connection. <Text className="font-inter-medium text-primary-text">Add a bio.</Text>
        </Text>
      </Link> : null}
    {actions ? <View className="self-stretch pt-1">{actions}</View> : null}
  </View>;
}
