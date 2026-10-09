import { cn } from '@/lib/utils';
import { Platform, TextInput, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';
import { Icon } from './icon';

export type InputProps = React.ComponentProps<typeof TextInput> & {
  variant?: 'default' | 'search' | 'multiline'; invalid?: boolean;
  // Figma "Text input" and "Search field" place a 20px icon before the text and an
  // optional control (for example show/hide password) after it.
  leadingIcon?: LucideIcon; trailing?: ReactNode;
};
function Input({ className, variant = 'default', invalid, leadingIcon, trailing, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const { scheme } = usePenguinTheme();
  const multiline = variant === 'multiline' || props.multiline;
  const disabled = props.editable === false;
  const shared: React.ComponentProps<typeof TextInput> = {
    placeholderTextColor: colors[scheme]['muted-foreground'],
    selectionColor: colors[scheme].primary,
    returnKeyType: variant === 'search' ? 'search' : undefined,
    ...props,
    'aria-disabled': disabled || props['aria-disabled'],
    accessibilityState: { ...props.accessibilityState, disabled: disabled || props.accessibilityState?.disabled },
    multiline,
    textAlignVertical: multiline ? 'top' : 'center',
    onFocus: event => { setFocused(true); onFocus?.(event); },
    onBlur: event => { setFocused(false); onBlur?.(event); },
  };
  if (leadingIcon || trailing) {
    // The border and fill move to a wrapper so the icons sit inside the control.
    return <View className={cn(
      'border-input bg-card min-h-[52px] w-full flex-row items-center gap-[10px] rounded-md border px-[14px]',
      focused && 'border-2 border-primary px-[13px]',
      invalid && 'border-destructive',
      disabled && 'bg-muted',
      className
    )}>
      {leadingIcon ? <Icon as={leadingIcon} color="muted-foreground" /> : null}
      <TextInput
        {...shared}
        aria-invalid={invalid}
        className={cn('text-foreground min-w-0 flex-1 py-3 text-body font-sans', Platform.select({ web: 'outline-none' }))}
      />
      {trailing}
    </View>;
  }
  return (
    <TextInput
      {...shared}
      aria-invalid={invalid}
      className={cn(
        'border-input bg-card text-foreground min-h-[52px] w-full min-w-0 rounded-md border px-[14px] py-3 text-body font-sans',
        multiline && 'min-h-28',
        focused && 'border-2 border-primary px-[13px] py-[11px]',
        invalid && 'border-destructive',
        disabled &&
        cn(
          'bg-muted',
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
    />
  );
}

export { Input };
