import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';
import { useState } from 'react';
import { colors } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';

export type InputProps = React.ComponentProps<typeof TextInput> & {
  variant?: 'default' | 'search' | 'multiline'; invalid?: boolean;
};
function Input({ className, variant = 'default', invalid, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const { scheme } = usePenguinTheme();
  return (
    <TextInput
      placeholderTextColor={colors[scheme]['muted-foreground']}
      selectionColor={colors[scheme].primary}
      returnKeyType={variant === 'search' ? 'search' : undefined}
      className={cn(
        'border-input bg-card text-foreground min-h-12 w-full min-w-0 rounded-md border px-4 py-3 text-body',
        variant === 'search' && 'rounded-full bg-muted',
        (variant === 'multiline' || props.multiline) && 'min-h-28',
        focused && 'border-primary',
        invalid && 'border-destructive',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: '',
        }),
        className
      )}
      {...props}
      aria-disabled={props.editable === false || props['aria-disabled']}
      accessibilityState={{ ...props.accessibilityState, disabled: props.editable === false || props.accessibilityState?.disabled }}
      multiline={variant === 'multiline' || props.multiline}
      textAlignVertical={variant === 'multiline' || props.multiline ? 'top' : 'center'}
      aria-invalid={invalid}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
    />
  );
}

export { Input };

