import type { PropsWithChildren } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { AuthFrame } from './auth-frame';

// Layout for the email, recovery and link-landing screens, following the Figma
// "Email verification" frame: navigation title, symbol tile, then the heading.
export function EmailFrame({ title, navTitle, icon, onBack, children }: PropsWithChildren<{
  title: string; navTitle?: string; icon?: LucideIcon; onBack?: () => void;
}>) {
  return <AuthFrame navTitle={navTitle} onBack={onBack}>
    {icon ? <IconTile icon={icon} tone="accent" /> : null}
    <Text variant="h2">{title}</Text>
    {children}
  </AuthFrame>;
}
