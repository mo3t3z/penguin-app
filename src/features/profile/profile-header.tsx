import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Badge } from '@/components/ui/badge';
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

// Figma "Profile identity": 80px portrait, name, username, bio, then the
// institution badge and the field and study-level badges. `actions` is the button
// row underneath; a student profile passes none.
export function ProfileHeader({ profile, studies, own, actions }: {
  profile: PublicProfile;
  studies: ProfileStudyDetails;
  own: boolean;
  actions?: ReactNode;
}) {
  const name = profileDisplayName(profile.display_name);
  const bio = profile.bio?.trim();
  const level = profile.study_level ? studyLevels[profile.study_level] : null;
  return <View className="gap-4 px-1 pt-4">
    <UserAvatar name={name} uri={profile.avatar_url} size="profile" />
    <View className="gap-0.5">
      <Text variant="h2" accessibilityRole="header">{name}</Text>
      {profile.username ? <Text variant="lead">@{profile.username}</Text> : null}
    </View>
    {bio ? <Text selectable>{bio}</Text>
      : own ? <Text className="text-muted-foreground">A few words can start a connection. Add a bio in Edit Profile.</Text> : null}
    {studies.loading ? <View className="gap-2" accessibilityLabel="Loading study details" accessibilityState={{ busy: true }}>
      <Skeleton className="h-6 w-44 rounded-sm" />
      <Skeleton className="h-6 w-56 rounded-sm" />
    </View> : studies.failed ? <View className="items-start gap-1">
      <Text variant="muted" accessibilityLiveRegion="polite">Study details couldn’t load.</Text>
      <Button variant="link" className="min-h-12 px-0" onPress={studies.retry}><Text>Retry study details</Text></Button>
    </View> : <View className="gap-2">
      {studies.institution ? <View className="flex-row">
        <Badge variant="subject" className="shrink">
          <Icon as={Building2} size={12} color="muted-foreground" />
          <Text numberOfLines={1} className="shrink">{studies.institution.name}</Text>
        </Badge>
      </View> : null}
      <View className="flex-row flex-wrap gap-2">
        {studies.field ? <Badge variant="subject" className="shrink"><Text numberOfLines={1} className="shrink">{studies.field.name}</Text></Badge> : null}
        {level ? <Badge variant="subject"><Text>{level}</Text></Badge> : null}
      </View>
    </View>}
    {actions}
  </View>;
}
