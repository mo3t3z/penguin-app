import { View } from 'react-native';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import type { Field, Institution, Profile } from '@/lib/database.types';
import { studyLevels } from './study-levels';

export function ProfileIdentity({ profile, ownProfile = false }: { profile: Profile; ownProfile?: boolean }) {
  const name = profile.display_name?.trim() || 'Penguin student';
  const initials = name.split(/\s+/).slice(0, 2).map(part => [...part][0]).join('').toUpperCase();
  return <View className="gap-5">
    <Card variant="highlighted"><CardContent className="gap-5">
      <Avatar key={profile.avatar_url ?? 'initials'} alt={`${name}'s avatar`} size="profile">
        {profile.avatar_url ? <AvatarImage source={{ uri: profile.avatar_url }} /> : null}
        <AvatarFallback className="bg-secondary"><Text variant="h2" className="text-primary">{initials}</Text></AvatarFallback>
      </Avatar>
      <View className="gap-1"><Text variant="h1">{name}</Text>
        {profile.username ? <Text variant="lead" className="text-primary">@{profile.username}</Text> : null}
      </View>
    </CardContent></Card>
    {profile.bio?.trim() ? <Text>{profile.bio}</Text> : ownProfile ? <Text variant="muted">A few words can start a connection. Add a bio in Edit Profile.</Text> : null}
  </View>;
}

export function ProfileStudies({ institution, field, level }: {
  institution: Institution | null; field: Field | null; level: Profile['study_level'];
}) {
  return <Card><CardContent className="gap-5">
    <Text variant="h3">Student life</Text>
    {[
      ['Institution', institution?.name ?? 'Institution unavailable'],
      ['Field of study', field?.name ?? 'Field of study unavailable'],
      ['Study level', level ? studyLevels[level] ?? 'Study level unavailable' : 'Study level unavailable'],
    ].map(([label, value]) => <View key={label} className="gap-1"><Text variant="muted">{label}</Text><Text>{value}</Text></View>)}
  </CardContent></Card>;
}
