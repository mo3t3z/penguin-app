import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { avatarSizes } from '@/theme/tokens';

type AvatarSize = keyof typeof avatarSizes;

const initialsClass: Record<AvatarSize, string> = {
  xs: 'text-micro', sm: 'text-micro', composer: 'text-caption', md: 'text-label',
  lg: 'text-body', xl: 'text-lead', profile: 'text-heading',
};

export function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

export function UserAvatar({ name, uri, size = 'md' }: { name: string; uri?: string | null; size?: AvatarSize }) {
  const source = uri?.trim() || null;
  return <Avatar key={source ?? 'initials'} alt={`${name}'s avatar`} size={size}>
    {source ? <AvatarImage source={{ uri: source }} /> : null}
    <AvatarFallback className="bg-muted">
      <Text className={cn('font-inter-semibold text-accent-foreground', initialsClass[size])}>{initialsFor(name)}</Text>
    </AvatarFallback>
  </Avatar>;
}
