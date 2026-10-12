import { cn } from '@/lib/utils';
import * as AvatarPrimitive from '@rn-primitives/avatar';
import { avatarSizes } from '@/theme/tokens';

function Avatar({
  className,
  size = 'md',
  style,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & { size?: keyof typeof avatarSizes }) {
  return (
    <AvatarPrimitive.Root
      className={cn('relative flex shrink-0 overflow-hidden rounded-full', className)}
      style={[{ width: avatarSizes[size], height: avatarSizes[size] }, style]}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn('aspect-square size-full', className)} {...props} />;
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        'bg-muted flex size-full flex-row items-center justify-center rounded-full',
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };

