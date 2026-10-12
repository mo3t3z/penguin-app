import { useState } from 'react';
import { Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { FormField } from './form-field';
import { Icon } from './icon';

type PasswordFieldProps = Omit<React.ComponentProps<typeof FormField>, 'secureTextEntry' | 'trailing'>;

// Password input: hidden by default with an eye control to reveal it.
export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <FormField
    autoCapitalize="none"
    autoCorrect={false}
    {...props}
    secureTextEntry={!visible}
    trailing={<Pressable
      className="size-6 items-center justify-center"
      role="button"
      hitSlop={12}
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      onPress={() => setVisible(value => !value)}
    >
      <Icon as={visible ? Eye : EyeOff} color="muted-foreground" />
    </Pressable>}
  />;
}
