import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ActivityIndicator, Platform, Pressable } from 'react-native';
import { colors } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

// 48px high (compact 40 for header actions, with hitSlop to 48), 14px corners.
// One `default` (primary) button per screen marks its main action; `outline` is for
// secondary actions, `ghost` and `link` for inline ones, `destructive` only inside
// menus and dialogs.
const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md',
    Platform.select({
      web: 'whitespace-nowrap outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none',
    })
  ),
  {
    variants: {
      variant: {
        default: cn('bg-primary active:bg-primary-pressed', Platform.select({ web: 'hover:bg-primary-pressed' })),
        destructive: cn('active:bg-muted', Platform.select({ web: 'hover:bg-muted' })),
        outline: cn('border-input active:bg-muted border-1.5', Platform.select({ web: 'hover:bg-muted' })),
        secondary: cn('border-input active:bg-muted border-1.5', Platform.select({ web: 'hover:bg-muted' })),
        ghost: cn('active:bg-muted', Platform.select({ web: 'hover:bg-muted' })),
        link: '',
      },
      size: {
        default: 'min-h-12 px-5 py-3',
        sm: 'min-h-10 px-4 py-2',
        lg: 'min-h-12 px-6 py-3',
        icon: 'size-12 rounded-full',
      },
    },
    compoundVariants: [
      { variant: 'ghost', size: 'default', className: 'px-3' },
      { variant: 'ghost', size: 'sm', className: 'px-3' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-label font-inter-semibold',
    Platform.select({ web: 'pointer-events-none' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive',
        outline: 'text-foreground',
        secondary: 'text-foreground',
        ghost: 'text-primary-text',
        link: cn(
          'text-primary-text group-active:underline',
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

// Compact buttons are 40px tall; the slop restores the 48px touch target.
const compactHitSlop = { top: 4, bottom: 4 };

function Button({ className, variant, size, loading = false, disabled, children, hitSlop, ...props }: ButtonProps) {
  const { scheme } = usePenguinTheme();
  const kind = variant ?? 'default';
  const spinnerColor = kind === 'default' ? colors[scheme]['primary-foreground'] : kind === 'destructive' ? colors[scheme].destructive : kind === 'ghost' || kind === 'link' ? colors[scheme]['primary-text'] : colors[scheme].foreground;
  // Disabled buttons with a fill or outline become `muted` with a `disabled-foreground`
  // label; text-only ones fade. Loading keeps the action colour.
  const filledDisabled = Boolean(disabled) && !loading && size !== 'icon' && (kind === 'default' || kind === 'outline' || kind === 'secondary');
  const fadedDisabled = Boolean(disabled) && !loading && !filledDisabled;
  return (
    <TextClassContext.Provider value={cn(buttonTextVariants({ variant, size }), filledDisabled && 'text-disabled-foreground')}>
      <Pressable
        className={cn(
          buttonVariants({ variant, size }),
          filledDisabled && 'bg-muted border-transparent',
          fadedDisabled && 'opacity-50',
          className
        )}
        role="button"
        hitSlop={hitSlop ?? (size === 'sm' ? compactHitSlop : undefined)}
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
