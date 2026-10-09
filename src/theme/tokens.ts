// Light values come from the Penguin Figma kit (Snow, Ink, Teal, Ice, Rule, Error).
// muted-foreground and accent-foreground are slightly deeper than Figma so text on
// Ice and tinted fills keeps WCAG AA contrast. Dark is derived from Ink and Teal.
export const colors = {
  light: {
    background: '#F7FAFB', foreground: '#142D3B', card: '#FFFFFF',
    'card-foreground': '#142D3B', muted: '#E8F2F5', 'muted-foreground': '#586C7A',
    primary: '#087F83', 'primary-foreground': '#FFFFFF',
    secondary: '#E8F2F5', 'secondary-foreground': '#142D3B',
    accent: '#E0F2EF', 'accent-foreground': '#066F73',
    border: '#DCE6EA', input: '#DCE6EA', ring: '#087F83', skeleton: '#E3EBEF',
    destructive: '#B74343', 'destructive-foreground': '#FFFFFF',
    success: '#166534', warning: '#854D0E',
  },
  dark: {
    background: '#0C1B24', foreground: '#EAF2F5', card: '#13252F',
    'card-foreground': '#EAF2F5', muted: '#1B323E', 'muted-foreground': '#9BB0BC',
    primary: '#4FC4C8', 'primary-foreground': '#06282B',
    secondary: '#1B323E', 'secondary-foreground': '#EAF2F5',
    accent: '#12383C', 'accent-foreground': '#A9E6E8',
    border: '#25404D', input: '#25404D', ring: '#4FC4C8', skeleton: '#213945',
    destructive: '#F0908C', 'destructive-foreground': '#3A0F0E',
    success: '#86EFAC', warning: '#FDE68A',
  },
} as const;

export type ColorToken = keyof typeof colors.light;
export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;
export const radius = { image: 8, control: 12, card: 16, sheet: 24, full: 9999 } as const;
export const avatarSizes = { xs: 24, sm: 32, composer: 34, md: 40, lg: 48, xl: 64, profile: 80 } as const;
export const motion = { quick: 120, standard: 180, gentle: 220 } as const;
// Loaded at startup in the root layout; names match the Tailwind font-family utilities.
export const fonts = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold',
} as const;
