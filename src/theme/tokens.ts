// Warm Minimal Social palette, from the Penguin design system (tokens.json): warm
// paper and warm night surfaces with Volcanic Orange (#FF7A00) as a fill. Text on
// orange is `primary-foreground`, orange you read is `primary-text`, and every text
// pair keeps WCAG AA contrast (tests/theme-contrast.test.mjs).
//
// Eight-digit values carry alpha. NativeWind's RGB variables cannot hold them, so
// they have no Tailwind class: apply them with `style` (see `alphaColorTokens`).
export const colors = {
  light: {
    background: '#FAF7F2', card: '#FFFFFF', 'surface-raised': '#FFFFFF',
    'nav-surface': '#FFFFFFE0', 'nav-surface-solid': '#FFFFFFF5', 'nav-label': '#554D45',
    'nav-border': '#1C17121A', 'nav-active': '#1C171212', muted: '#F3EEE7',
    foreground: '#1C1712', 'muted-foreground': '#6A6158', primary: '#FF7A00',
    'primary-foreground': '#1C1712', 'primary-pressed': '#E56D00', 'primary-text': '#A84B00',
    accent: '#FFF0E1', 'accent-foreground': '#8A3D00', secondary: '#F3EEE7',
    'secondary-foreground': '#1C1712', border: '#ECE5DC', divider: '#ECE5DC',
    input: '#8C8177', focus: '#B35300', ring: '#B35300', skeleton: '#EDE6DD',
    'disabled-foreground': '#8C8177', success: '#1F7A4D', 'success-surface': '#E6F4EC',
    warning: '#8A5A00', 'warning-surface': '#FFF3D6', destructive: '#C0264F',
    'destructive-foreground': '#FFFFFF', 'destructive-surface': '#FCE8EE', info: '#2F5FD0',
    'info-surface': '#E8EEFC', overlay: '#1C171266',
  },
  dark: {
    background: '#15120F', card: '#1E1A16', 'surface-raised': '#2B2620',
    'nav-surface': '#2B2620E0', 'nav-surface-solid': '#2B2620F5', 'nav-label': '#C4BBB1',
    'nav-border': '#FFFFFF1A', 'nav-active': '#FFFFFF1F', muted: '#27221D',
    foreground: '#F6F1EA', 'muted-foreground': '#ADA399', primary: '#FF7A00',
    'primary-foreground': '#1C1712', 'primary-pressed': '#E56D00', 'primary-text': '#FF9A3D',
    accent: '#3A230F', 'accent-foreground': '#FFC08A', secondary: '#27221D',
    'secondary-foreground': '#F6F1EA', border: '#332C25', divider: '#332C25',
    input: '#7F7469', focus: '#FFA552', ring: '#FFA552', skeleton: '#2A2420',
    'disabled-foreground': '#7F7469', success: '#6FD79F', 'success-surface': '#12291C',
    warning: '#F2C66D', 'warning-surface': '#302410', destructive: '#FF8FA8',
    'destructive-foreground': '#2A0A12', 'destructive-surface': '#3A1520', info: '#9DB8FF',
    'info-surface': '#18213A', overlay: '#000000A6',
  },
} as const;

export const alphaColorTokens = ['nav-surface', 'nav-surface-solid', 'nav-border', 'nav-active', 'overlay'] as const;

// The in-app wordmark: ink on paper. Its dot is `primary`.
export const brand = { wordmark: { light: '#1C1712', dark: '#F6F1EA' } } as const;

export type ColorToken = keyof typeof colors.light;
// Tokens with a Tailwind class and an opaque value, safe for icons and native props.
export type SolidColorToken = Exclude<ColorToken, typeof alphaColorTokens[number]>;
export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;
// `beak` is the one tight corner that points at the source: last bubble of a group,
// the Create tile and the send button. Nowhere else.
export const radius = { beak: 6, sm: 10, md: 14, lg: 20, xl: 24, full: 9999 } as const;
export const avatarSizes = { xs: 24, sm: 28, md: 40, lg: 48, xl: 96 } as const;
export const iconSizes = { sm: 16, md: 20, lg: 24 } as const;
export const layout = {
  touchMin: 48, header: 56, headerChat: 64, navHeight: 64, navInsetX: 12, navOffsetBottom: 12,
  navIndicator: { width: 64, height: 52 }, createTile: 48, button: 48, buttonCompact: 40,
  field: 48, chip: 36, tab: 44, row: 72, contentMaxWidth: 600, navMaxWidth: 440,
} as const;
export const motion = { quick: 120, standard: 180, gentle: 240 } as const;
// Only floating layers cast a shadow: `raised` for the navigation island, menus,
// dialogs and toasts, `sheet` for bottom sheets. Apply with shadowStyle() from
// src/theme/shadow.ts.
export const shadows = {
  raised: { elevation: 6, light: '0 8px 24px rgba(28, 23, 18, 0.10)', dark: '0 8px 24px rgba(0, 0, 0, 0.45)' },
  sheet: { elevation: 12, light: '0 -8px 32px rgba(28, 23, 18, 0.18)', dark: '0 -8px 32px rgba(0, 0, 0, 0.5)' },
} as const;
// Loaded at startup in the root layout; names match the Tailwind font-family utilities.
// The design system specifies Readex Pro; Inter stays until that dependency is approved.
export const fonts = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold',
} as const;
