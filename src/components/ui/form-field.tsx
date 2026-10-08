import { useId } from 'react';
import { View } from 'react-native';
import { Input, type InputProps } from './input';
import { Text } from './text';

export function FormField({ label, hint, error, required, nativeID, ...props }: InputProps & {
  label: string; hint?: string; error?: string; required?: boolean;
}) {
  const generatedId = useId();
  const id = nativeID ?? generatedId;
  const description = error || hint;
  return <View className="gap-2">
    <Text nativeID={`${id}-label`} variant="small">{label}{required ? ' *' : ''}</Text>
    <Input {...props} nativeID={id} invalid={Boolean(error)}
      accessibilityLabel={label} accessibilityLabelledBy={`${id}-label`}
      accessibilityHint={description} aria-required={required}
      aria-describedby={description ? `${id}-description` : undefined} />
    {description ? <Text nativeID={`${id}-description`} variant="small"
      className={error ? 'text-destructive' : 'text-muted-foreground'}
      accessibilityLiveRegion={error ? 'polite' : 'none'}>{description}</Text> : null}
  </View>;
}
