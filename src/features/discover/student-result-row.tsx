import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import { studentDetail, type StudentResult } from './student-search';

// Figma Discover student row: 40px avatar, name over @username, then
// "Institution · Field". The whole row opens that student's profile.
function StudentResultRowComponent({ student, onOpen }: {
  student: StudentResult;
  onOpen: (studentId: string) => void;
}) {
  const name = profileDisplayName(student.display_name);
  const username = student.username?.trim() || 'student';
  const detail = studentDetail(student);
  return <Pressable
    className="min-h-12 flex-row items-center gap-[10px] py-2 active:opacity-70"
    role="button"
    accessibilityLabel={`View ${name}’s profile. @${username}${detail ? `. ${detail}` : ''}`}
    onPress={() => onOpen(student.id)}
  >
    <UserAvatar name={name} uri={student.avatar_url} size="md" />
    <View className="min-w-0 flex-1">
      <Text variant="large" numberOfLines={1}>{name}</Text>
      <Text variant="muted" numberOfLines={1}>@{username}</Text>
      {detail ? <Text numberOfLines={1} className="text-micro text-muted-foreground">{detail}</Text> : null}
    </View>
  </Pressable>;
}

export const StudentResultRow = memo(StudentResultRowComponent);
