import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { avatarSizes } from '@/theme/tokens';

type AvatarSize = keyof typeof avatarSizes;

// xs 24 search meta and navigation, sm 28 beside received bubbles, md 40 posts,
// comments and chat header, lg 48 rows and tiles, xl 96 profile. Nothing else.
const initialsClass: Record<AvatarSize, string> = {
  xs: 'text-micro', sm: 'text-micro', md: 'text-callout', lg: 'text-body', xl: 'text-display',
};

export function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

// The fallback is `muted` or `accent`, chosen from the name so it never changes
// between screens.
function accentFallback(name: string) {
  let sum = 0;
  for (const character of name) sum += character.codePointAt(0) ?? 0;
  return sum % 2 === 1;
}

export function UserAvatar({ name, uri, size = 'md' }: { name: string; uri?: string | null; size?: AvatarSize }) {
  const source = uri?.trim() || null;
  const accent = accentFallback(name);
  return <Avatar key={source ?? 'initials'} alt={`${name}'s avatar`} size={size}>
    {source ? <AvatarImage source={{ uri: source }} /> : null}
    <AvatarFallback className={accent ? 'bg-accent' : 'bg-muted'}>
      <Text className={cn('font-inter-semibold', accent ? 'text-accent-foreground' : 'text-foreground', initialsClass[size])}>{initialsFor(name)}</Text>
    </AvatarFallback>
  </Avatar>;
}
