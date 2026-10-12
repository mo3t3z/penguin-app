import { View } from 'react-native';
import { BookOpen, Building2, GraduationCap } from 'lucide-react-native';
import { InfoRow } from '@/components/forms/info-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { joinedLabel } from './profile-format';
import type { ProfileStudyDetails } from './profile-header';
import type { PublicProfile } from './service';
import { studyLevels } from './study-levels';

// Academic details: institution, field and study level rows, then the
// month the student joined.
export function ProfileAbout({ profile, studies }: { profile: PublicProfile; studies: ProfileStudyDetails }) {
  const joined = joinedLabel(profile.created_at);
  return <View className="gap-4 px-5 pt-4">
    {studies.loading ? <View className="gap-4" accessibilityLabel="Loading study details" accessibilityState={{ busy: true }}>
      <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
    </View> : studies.failed ? <View className="items-start gap-1">
      <Text accessibilityLiveRegion="polite">We couldn’t load the institution and field. Check your connection and retry.</Text>
      <Button variant="outline" onPress={studies.retry}><Text>Retry study details</Text></Button>
    </View> : <>
      <InfoRow icon={Building2} label="Institution" value={studies.institution?.name ?? 'Not shared'} />
      <InfoRow icon={BookOpen} label="Field of study" value={studies.field?.name ?? 'Not shared'} />
    </>}
    <InfoRow icon={GraduationCap} label="Study level" value={profile.study_level ? studyLevels[profile.study_level] : 'Not shared'} />
    {joined ? <Text variant="caption" className="pt-2 text-muted-foreground">{joined}</Text> : null}
  </View>;
}
