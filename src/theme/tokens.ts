export const colors = {
  light: {
    background: '#F6F8FA', foreground: '#152633', card: '#FFFFFF',
    'card-foreground': '#152633', muted: '#EAF0F4', 'muted-foreground': '#526575',
    primary: '#006D77', 'primary-foreground': '#FFFFFF',
    secondary: '#EAF0F4', 'secondary-foreground': '#152633',
    accent: '#DDF3F4', 'accent-foreground': '#00515A',
    border: '#D5DFE6', input: '#758896', ring: '#006D77',
    destructive: '#B42318', 'destructive-foreground': '#FFFFFF',
    success: '#166534', warning: '#854D0E',
  },
  dark: {
    background: '#101820', foreground: '#F1F6FA', card: '#18232D',
    'card-foreground': '#F1F6FA', muted: '#22313D', 'muted-foreground': '#A9BBC9',
    primary: '#73DCE2', 'primary-foreground': '#102126',
    secondary: '#22313D', 'secondary-foreground': '#F1F6FA',
    accent: '#193F46', 'accent-foreground': '#A7EDF0',
    border: '#354957', input: '#728996', ring: '#73DCE2',
    destructive: '#FDA29B', 'destructive-foreground': '#39110E',
    success: '#86EFAC', warning: '#FDE68A',
  },
} as const;

export type ColorToken = keyof typeof colors.light;
export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;
export const radius = { small: 8, control: 12, card: 20, sheet: 24, full: 9999 } as const;
export const avatarSizes = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64, profile: 96 } as const;
export const motion = { quick: 120, standard: 180, gentle: 220 } as const;
