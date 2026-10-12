import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, View } from 'react-native';

const badgeVariants = cva(
  cn(
    'border-border group shrink-0 flex-row items-center justify-center gap-1 overflow-hidden rounded-sm border px-2 py-1',
    Platform.select({
      web: 'w-fit whitespace-nowrap',
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary border-transparent',
          Platform.select({ web: '[a&]:hover:bg-primary/90' })
        ),
        secondary: cn(
          'bg-secondary border-transparent',
          Platform.select({ web: '[a&]:hover:bg-secondary/90' })
        ),
        destructive: cn(
          'bg-destructive border-transparent',
          Platform.select({ web: '[a&]:hover:bg-destructive/90' })
        ),
        outline: Platform.select({ web: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground' }),
        campus: 'bg-muted border-transparent',
        subject: 'bg-muted border-transparent',
        success: 'border-success bg-transparent',
        warning: 'border-warning bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const badgeTextVariants = cva('text-micro font-inter-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      campus: 'text-muted-foreground',
      subject: 'text-muted-foreground',
      success: 'text-success',
      warning: 'text-warning',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = React.ComponentProps<typeof View> & React.RefAttributes<View> & {
  asChild?: boolean;
} & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export { Badge, badgeTextVariants, badgeVariants };
export type { BadgeProps };

