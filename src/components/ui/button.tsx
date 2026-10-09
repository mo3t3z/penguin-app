import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ActivityIndicator, Platform, Pressable } from 'react-native';
import { colors } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn('bg-primary active:bg-primary/90', Platform.select({ web: 'hover:bg-primary/90' })),
        destructive: cn(
          'bg-destructive active:bg-destructive/90',
          Platform.select({
            web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
          })
        ),
        // Figma "Secondary button": card surface, Rule border, teal label.
        outline: cn('border-border bg-card active:bg-accent border', Platform.select({ web: 'hover:bg-accent' })),
        secondary: cn('border-border bg-card active:bg-accent border', Platform.select({ web: 'hover:bg-accent' })),
        ghost: cn('active:bg-accent', Platform.select({ web: 'hover:bg-accent' })),
        link: '',
      },
      size: {
        default: 'min-h-12 px-4 py-3',
        sm: 'min-h-12 gap-1.5 px-3 py-3',
        lg: 'min-h-12 px-6 py-3',
        // 44px visual per Figma; the default hitSlop below keeps a 48px touch target.
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-metadata font-inter-semibold',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: 'text-primary',
        secondary: 'text-primary',
        ghost: 'text-primary',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = React.ComponentProps<typeof Pressable> & VariantProps<typeof buttonVariants> & { loading?: boolean };

const iconHitSlop = 2;

function Button({ className, variant, size, loading = false, disabled, children, hitSlop, ...props }: ButtonProps) {
  const { scheme } = usePenguinTheme();
  const kind = variant ?? 'default';
  const spinnerColor = kind === 'default' ? colors[scheme]['primary-foreground'] : kind === 'destructive' ? colors[scheme]['destructive-foreground'] : colors[scheme].primary;
  // Figma disabled state is an Ice fill with secondary text; loading keeps the action colour.
  const filledDisabled = Boolean(disabled) && !loading && size !== 'icon' && kind !== 'link' && kind !== 'destructive';
  const fadedDisabled = Boolean(disabled) && !loading && !filledDisabled;
  return (
    <TextClassContext.Provider value={cn(buttonTextVariants({ variant, size }), filledDisabled && 'text-muted-foreground')}>
      <Pressable
        className={cn(
          buttonVariants({ variant, size }),
          filledDisabled && 'bg-muted border-transparent',
          fadedDisabled && 'opacity-50',
          className
        )}
        role="button"
        hitSlop={hitSlop ?? (size === 'icon' ? iconHitSlop : undefined)}
        {...props}
        disabled={disabled || loading}
        aria-busy={loading || props['aria-busy']}
        accessibilityState={{ ...props.accessibilityState, disabled: disabled || loading, busy: loading }}
      >
        {(state) => <>
          {loading ? <ActivityIndicator color={spinnerColor} accessibilityElementsHidden /> : null}
          {typeof children === 'function' ? children(state) : children}
        </>}
      </Pressable>
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
