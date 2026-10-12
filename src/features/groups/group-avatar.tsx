import { View } from 'react-native';
import { initialsFor } from '@/components/social/user-avatar';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// Groups have no image yet, so a group is shown by its initials in a rounded
// square: the shape tells it apart from a student, who is always a circle. The
// fill is `muted` or `accent`, chosen from the name so it never changes between
// screens.
function accentFallback(name: string) {
  let sum = 0;
  for (const character of name) sum += character.codePointAt(0) ?? 0;
  return sum % 2 === 1;
}

export function GroupAvatar({ name, size = 'lg' }: { name: string; size?: 'lg' | 'xl' }) {
  const accent = accentFallback(name);
  return <View
    className={cn('items-center justify-center', size === 'xl' ? 'size-24 rounded-lg' : 'size-12 rounded-md', accent ? 'bg-accent' : 'bg-muted')}
    aria-hidden
  >
    <Text className={cn('font-inter-semibold', size === 'xl' ? 'text-display' : 'text-body', accent ? 'text-accent-foreground' : 'text-foreground')}>
      {initialsFor(name)}
    </Text>
  </View>;
}
