import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Link } from 'expo-router';
import { BadgeCheck, CalendarDays, Camera, GraduationCap, MapPin } from 'lucide-react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Field, Institution } from '@/lib/database.types';
import { useProfileStats } from '@/features/connections/use-profile-stats';
import { usePenguinTheme } from '@/theme/provider';
import { colors } from '@/theme/tokens';
import { joinedMonthLabel, profileDisplayName } from './profile-format';
import { ProfilePhotoActions } from './profile-photo';
import type { PublicProfile } from './service';
import { studyLevels } from './study-levels';

export type ProfileStudyDetails = {
  loading: boolean;
  failed: boolean;
  institution: Institution | null;
  field: Field | null;
  retry: () => void;
};

const COVER_HEIGHT = 128;
const AVATAR = 96;

// The cover image, or a quiet tint when the student has not set one. On your own
// profile Edit cover offers to view or change it.
export function Cover({ uri, own, inset = true }: { uri: string | null; own: boolean; inset?: boolean }) {
  return <View className={`${inset ? 'mx-3 ' : ''}overflow-hidden rounded-lg bg-accent`} style={{ height: COVER_HEIGHT }}>
    {uri ? <Image source={{ uri }} className="absolute inset-0" resizeMode="cover" accessibilityIgnoresInvertColors aria-hidden /> : null}
    {own ? <View className="absolute bottom-2 right-2">
      <ProfilePhotoActions kind="cover" uri={uri} own label="Edit cover">
        <View className="flex-row items-center gap-1.5 rounded-sm bg-black/60 px-3 py-1.5">
          <Camera size={16} color="#FFFFFF" aria-hidden />
          <Text className="font-inter-medium text-footnote text-white">Edit cover</Text>
        </View>
      </ProfilePhotoActions>
    </View> : null}
  </View>;
}

function Stat({ value, label }: { value: number | null; label: string }) {
  return <View accessible accessibilityLabel={value === null ? `${label} loading` : `${value} ${label}`}>
    {value === null ? <Skeleton className="mb-1 h-5 w-8 rounded-full" />
      : <Text className="font-inter-bold text-headline">{value.toLocaleString()}</Text>}
    <Text className="text-footnote text-muted-foreground">{label}</Text>
  </View>;
}

// The top of a profile: cover, 96px portrait overlapping it, the action on the
// right (Edit profile on your own, Connect on another student's), name with the
// verified badge, @username and study level, bio, city and join month, counts,
// interests and the study line. `actions` is that right-hand action.
export function ProfileHeader({ profile, studies, own, actions }: {
  profile: PublicProfile;
  studies: ProfileStudyDetails;
  own: boolean;
  actions?: ReactNode;
}) {
  const { scheme } = usePenguinTheme();
  const stats = useProfileStats(profile.id);
  const name = profileDisplayName(profile.display_name);
  const bio = profile.bio?.trim();
  const level = profile.study_level ? studyLevels[profile.study_level] : null;
  const study = [studies.institution?.name?.trim(), studies.field?.name?.trim()].filter(Boolean).join(' · ');
  const joined = joinedMonthLabel(profile.created_at);
  const interests = profile.interests ?? [];
  return <View className="pb-4">
    <Cover uri={profile.cover_url} own={own} />
    <View className="flex-row items-end justify-between px-5" style={{ marginTop: -AVATAR / 2 }}>
      <ProfilePhotoActions kind="avatar" uri={profile.avatar_url} own={own}
        label={own ? 'Profile photo. View or change it' : `View ${name}'s photo`}>
        <View className="rounded-full border-4 border-background">
          <UserAvatar name={name} uri={profile.avatar_url} size="xl" />
          {own ? <View className="absolute bottom-0 right-0 size-8 items-center justify-center rounded-full border-2 border-background bg-foreground">
            <Camera size={14} color={colors[scheme].background} aria-hidden />
          </View> : null}
        </View>
      </ProfilePhotoActions>
      {actions ? <View className="pb-1">{actions}</View> : null}
    </View>

    <View className="gap-3 px-5 pt-3">
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <Text variant="h2" className="shrink font-inter-bold" accessibilityRole="header">{name}</Text>
          {profile.is_verified ? <BadgeCheck size={22} color={colors[scheme].background} fill={colors[scheme].primary}
            accessibilityLabel="Verified" /> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          {profile.username ? <Text variant="callout" className="text-muted-foreground">@{profile.username}</Text> : null}
          {level ? <View className="rounded-sm bg-muted px-2 py-0.5"><Text className="text-footnote">{level}</Text></View> : null}
        </View>
      </View>

      {bio ? <Text selectable>{bio}</Text>
        : own ? <Link href="/edit-profile" asChild>
          <Text className="text-muted-foreground" role="link">
            A few words can start a connection. <Text className="font-inter-medium text-primary-text">Add a bio.</Text>
          </Text>
        </Link> : null}

      {studies.loading ? <Skeleton className="h-3 w-56 rounded-full" />
        : studies.failed ? <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className="text-footnote text-muted-foreground" accessibilityLiveRegion="polite">Study details couldn’t load.</Text>
          <Button variant="link" className="px-0" accessibilityLabel="Retry study details" onPress={studies.retry}><Text>Retry</Text></Button>
        </View> : study ? <View className="flex-row gap-1.5">
          <Icon as={GraduationCap} size={16} color="muted-foreground" />
          <Text className="shrink text-footnote text-muted-foreground">{study}</Text>
        </View> : null}

      {profile.location || joined ? <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {profile.location ? <View className="flex-row items-center gap-1.5">
          <Icon as={MapPin} size={16} color="muted-foreground" />
          <Text className="text-footnote text-muted-foreground">{profile.location}</Text>
        </View> : null}
        {joined ? <View className="flex-row items-center gap-1.5">
          <Icon as={CalendarDays} size={16} color="muted-foreground" />
          <Text className="text-footnote text-muted-foreground">{joined}</Text>
        </View> : null}
      </View> : null}

      <View className="flex-row gap-10 pt-1">
        <Stat value={stats?.posts ?? null} label="Posts" />
        <Stat value={stats?.connections ?? null} label="Connections" />
      </View>

      {interests.length ? <View className="flex-row flex-wrap gap-2 rounded-lg bg-card p-3" accessibilityLabel={`Interests: ${interests.join(', ')}`}>
        {interests.map(interest => <View key={interest} className="rounded-full border border-border bg-background px-3 py-1.5">
          <Text className="text-footnote">{interest}</Text>
        </View>)}
      </View> : null}
    </View>
  </View>;
}
