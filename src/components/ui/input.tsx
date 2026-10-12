import { cn } from '@/lib/utils';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useState, type ReactNode } from 'react';
import { Search, X, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { usePenguinTheme } from '@/theme/provider';
import { Icon } from './icon';

export type InputProps = React.ComponentProps<typeof TextInput> & {
  variant?: 'default' | 'search' | 'multiline'; invalid?: boolean;
  // A 20px icon before the text and an optional control (for example show/hide
  // password) after it. `search` adds its own magnifier and clear button.
  leadingIcon?: LucideIcon; trailing?: ReactNode;
  // `className` styles the outlined control; this one styles the text inside it.
  inputClassName?: string;
};

// TextField: 48px high (multi-line grows), 14px corners, card fill, 1.5px `input`
// outline, 2px `focus` border when focused and 2px `destructive` when invalid.
function Input({ className, inputClassName, variant = 'default', invalid, leadingIcon, trailing, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  const { scheme } = usePenguinTheme();
  const search = variant === 'search';
  const multiline = variant === 'multiline' || props.multiline;
  const disabled = props.editable === false;
  const leading = leadingIcon ?? (search ? Search : undefined);
  const clear = search && props.value && props.onChangeText ? props.onChangeText : null;
  return <View className={cn(
    'border-input bg-card min-h-12 w-full flex-row items-center gap-2.5 rounded-md border-1.5 px-3.5',
    variant === 'multiline' && 'min-h-28',
    multiline && 'items-start',
    focused && 'border-2 border-focus',
    invalid && 'border-2 border-destructive',
    disabled && 'bg-muted',
    className
  )}>
    {leading ? <Icon as={leading} color="muted-foreground" /> : null}
    <TextInput
      placeholderTextColor={colors[scheme]['muted-foreground']}
      selectionColor={colors[scheme].primary}
      returnKeyType={search ? 'search' : undefined}
      autoCapitalize={search ? 'none' : undefined}
      autoCorrect={search ? false : undefined}
      {...props}
      aria-disabled={disabled || props['aria-disabled']}
      aria-invalid={invalid}
      accessibilityState={{ ...props.accessibilityState, disabled: disabled || props.accessibilityState?.disabled }}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      onFocus={event => { setFocused(true); onFocus?.(event); }}
      onBlur={event => { setFocused(false); onBlur?.(event); }}
      className={cn(
        'text-foreground min-w-0 flex-1 py-3 text-body font-sans',
        multiline && 'self-stretch',
        Platform.select({ web: 'outline-none placeholder:text-muted-foreground' }),
        inputClassName
      )}
    />
    {clear ? <Pressable
      className="-mr-2.5 size-10 items-center justify-center rounded-full active:bg-muted"
      role="button"
      hitSlop={4}
      accessibilityLabel="Clear search"
      onPress={() => clear('')}
    >
      <Icon as={X} color="muted-foreground" />
    </Pressable> : null}
    {trailing}
  </View>;
}

export { Input };
