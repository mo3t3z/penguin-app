import { useId } from 'react';
import { View } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { Icon } from './icon';
import { Input, type InputProps } from './input';
import { Text } from './text';

// `hideLabel` keeps the label for screen readers but not on screen, for forms whose
// placeholder and icon already say what goes in the field.
export function FormField({ label, hideLabel = false, hint, error, required, nativeID, ...props }: InputProps & {
  label: string; hideLabel?: boolean; hint?: string; error?: string; required?: boolean;
}) {
  const generatedId = useId();
  const id = nativeID ?? generatedId;
  const description = error || hint;
  return <View className="gap-1.5">
    {hideLabel ? null : <Text nativeID={`${id}-label`} variant="small">{label}</Text>}
    <Input {...props} nativeID={id} invalid={Boolean(error)}
      accessibilityLabel={label} accessibilityLabelledBy={hideLabel ? undefined : `${id}-label`}
      accessibilityHint={description} aria-required={required}
      aria-describedby={description ? `${id}-description` : undefined} />
    {description ? <View className="flex-row items-center gap-1.5">
      {error ? <Icon as={CircleAlert} size={16} color="destructive" /> : null}
      <Text nativeID={`${id}-description`} variant="caption"
        className={error ? 'flex-1 text-destructive' : 'flex-1 text-muted-foreground'}
        accessibilityLiveRegion={error ? 'polite' : 'none'}>{description}</Text>
    </View> : null}
  </View>;
}
