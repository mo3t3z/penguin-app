import { Image } from 'react-native';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { avatarSizes } from '@/theme/tokens';

type AvatarSize = keyof typeof avatarSizes;

// xs 24 search meta and navigation, sm 28 beside received bubbles, md 40 posts,
// comments and chat header, lg 48 rows and tiles, xl 96 profile. Nothing else.
export function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => [...part][0]).join('').toUpperCase() || 'P';
}

const defaultAvatar = require('../../../assets/default-avatar.webp');

// A student without a photo, or whose photo fails to load, gets the same default
// avatar everywhere.
export function UserAvatar({ name, uri, size = 'md' }: { name: string; uri?: string | null; size?: AvatarSize }) {
  const source = uri?.trim() || null;
  return <Avatar key={source ?? 'default'} alt={`${name}'s avatar`} size={size}>
    {source ? <AvatarImage source={{ uri: source }} /> : null}
    <AvatarFallback className="bg-transparent">
      <Image source={defaultAvatar} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
    </AvatarFallback>
  </Avatar>;
}
