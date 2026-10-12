import * as React from 'react';
import { View } from 'react-native';
import { useColorScheme, vars } from 'nativewind';
import { colors } from './tokens';

type ThemePreference = 'light' | 'dark' | 'system';
const ThemeContext = React.createContext<{
  preference: ThemePreference;
  scheme: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'system', scheme: 'light', setPreference: () => {} });

function variables(palette: typeof colors.light | typeof colors.dark) {
  // Tokens with alpha (eight digits) cannot be RGB variables; they are applied with `style`.
  return vars(Object.fromEntries(Object.entries(palette).filter(([, hex]) => hex.length === 7).map(([key, hex]) => {
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16)).join(' ');
    return [`--${key}`, rgb];
  })));
}
const themeVariables = { light: variables(colors.light), dark: variables(colors.dark) };

export function PenguinThemeProvider({ children }: React.PropsWithChildren) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setValue] = React.useState<ThemePreference>('system');
  const scheme = colorScheme ?? 'light';
  const setPreference = React.useCallback((value: ThemePreference) => {
    setColorScheme(value);
    setValue(value);
  }, [setColorScheme]);
  return (
    <ThemeContext.Provider value={{ preference, scheme, setPreference }}>
      <View style={[{ flex: 1, backgroundColor: colors[scheme].background }, themeVariables[scheme]]}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export const usePenguinTheme = () => React.useContext(ThemeContext);
