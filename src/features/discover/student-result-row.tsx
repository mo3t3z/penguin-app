import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { UserAvatar } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { profileDisplayName } from '@/features/profile/profile-format';
import { studentDetail, type StudentResult } from './student-search';

const TILE_WIDTH = 132;

function describe(student: StudentResult) {
  const name = profileDisplayName(student.display_name);
  const username = student.username?.trim() || 'student';
  const detail = studentDetail(student);
  return { name, username, detail, label: `View ${name}’s profile. @${username}${detail ? `. ${detail}` : ''}` };
}

// A student found by search, as a row: 72px high, 48px avatar, name over
// "@username · Institution". The whole row opens that student's profile.
function StudentResultRowComponent({ student, onOpen }: {
  student: StudentResult;
  onOpen: (studentId: string) => void;
}) {
  const { name, username, label } = describe(student);
  const institution = student.institution?.name?.trim();
  return <Pressable
    className="min-h-18 flex-row items-center gap-3 px-5 py-2 active:bg-muted"
    role="button"
    accessibilityLabel={label}
    onPress={() => onOpen(student.id)}
  >
    <UserAvatar name={name} uri={student.avatar_url} size="lg" />
    <View className="min-w-0 flex-1">
      <Text numberOfLines={1} className="font-inter-semibold">{name}</Text>
      <Text variant="callout" numberOfLines={1} className="text-muted-foreground">
        @{username}{institution ? ` · ${institution}` : ''}
      </Text>
    </View>
  </Pressable>;
}

// The same student as a tile in Discover's horizontal row: avatar, name (two lines
// at most) and "Institution · Field".
function StudentTileComponent({ student, onOpen }: {
  student: StudentResult;
  onOpen: (studentId: string) => void;
}) {
  const { name, username, detail, label } = describe(student);
  return <Pressable
    className="items-center gap-2 rounded-md border border-border bg-card px-3 py-4 active:bg-muted"
    style={{ width: TILE_WIDTH }}
    role="button"
    accessibilityLabel={label}
    onPress={() => onOpen(student.id)}
  >
    <UserAvatar name={name} uri={student.avatar_url} size="lg" />
    <Text variant="large" numberOfLines={2} className="text-center">{name}</Text>
    <Text variant="caption" numberOfLines={2} className="text-center text-muted-foreground">{detail || `@${username}`}</Text>
  </Pressable>;
}

export const StudentResultRow = memo(StudentResultRowComponent);
export const StudentTile = memo(StudentTileComponent);
export const STUDENT_TILE_WIDTH = TILE_WIDTH;
