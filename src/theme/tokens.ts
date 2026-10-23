// Nabd "Blueberry Refined" palette, from the Nabd design system (tokens.json):
// white and soft-gray surfaces, ink text and one blueberry blue (#4263C7) for what
// is active or new. Text on blue is `primary-foreground`, blue you read is
// `primary-text` (it lightens in dark), and every text pair keeps WCAG AA contrast
// (tests/theme-contrast.test.mjs).
//
// Eight-digit values carry alpha. NativeWind's RGB variables cannot hold them, so
// they have no Tailwind class: apply them with `style` (see `alphaColorTokens`).
export const colors = {
  light: {
    background: '#FFFFFF', card: '#F5F6FA', 'surface-raised': '#FFFFFF',
    'nav-surface': '#FFFFFFE6', 'nav-surface-solid': '#FFFFFFF5', 'nav-label': '#5D667A',
    'nav-border': '#17203314', 'nav-active': '#17203312', muted: '#F5F6FA',
    foreground: '#172033', 'muted-foreground': '#5D667A', primary: '#4263C7',
    'primary-foreground': '#FFFFFF', 'primary-pressed': '#344FA8', 'primary-text': '#4263C7',
    accent: '#F2F5FD', 'accent-foreground': '#344FA8', secondary: '#F5F6FA',
    'secondary-foreground': '#172033', border: '#E5E7EB', divider: '#E5E7EB',
    input: '#7C8497', focus: '#4263C7', ring: '#4263C7', skeleton: '#ECEEF3',
    'disabled-foreground': '#7C8497', success: '#067647', 'success-surface': '#ECFDF3',
    warning: '#B54708', 'warning-surface': '#FFFAEB', destructive: '#B42318',
    'destructive-foreground': '#FFFFFF', 'destructive-surface': '#FEF3F2', info: '#4263C7',
    'info-surface': '#F2F5FD', overlay: '#09090973',
  },
  dark: {
    background: '#090909', card: '#1C1C1C', 'surface-raised': '#1C1C1C',
    'nav-surface': '#1C1C1CE6', 'nav-surface-solid': '#1C1C1CF5', 'nav-label': '#A9ACBA',
    'nav-border': '#FFFFFF1A', 'nav-active': '#FFFFFF1F', muted: '#1C1C1C',
    foreground: '#F1F3FF', 'muted-foreground': '#A9ACBA', primary: '#4263C7',
    'primary-foreground': '#FFFFFF', 'primary-pressed': '#344FA8', 'primary-text': '#8AA0EC',
    accent: '#151A2B', 'accent-foreground': '#8AA0EC', secondary: '#1C1C1C',
    'secondary-foreground': '#F1F3FF', border: '#303039', divider: '#303039',
    input: '#7A7F8F', focus: '#8AA0EC', ring: '#8AA0EC', skeleton: '#242428',
    'disabled-foreground': '#7A7F8F', success: '#47CD89', 'success-surface': '#0E2A1C',
    warning: '#FDB022', 'warning-surface': '#2E2108', destructive: '#F97066',
    'destructive-foreground': '#090909', 'destructive-surface': '#2D1412', info: '#8AA0EC',
    'info-surface': '#151A2B', overlay: '#000000A6',
  },
} as const;

export const alphaColorTokens = ['nav-surface', 'nav-surface-solid', 'nav-border', 'nav-active', 'overlay'] as const;

// The in-app wordmark: ink on white. Its dot is `primary`.
export const brand = { wordmark: { light: '#172033', dark: '#F1F3FF' } } as const;

export type ColorToken = keyof typeof colors.light;
// Tokens with a Tailwind class and an opaque value, safe for icons and native props.
export type SolidColorToken = Exclude<ColorToken, typeof alphaColorTokens[number]>;
export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48] as const;
// `beak` is the one tight corner that points at the source: last bubble of a group,
// the Create tile and the send button. Nowhere else.
export const radius = { beak: 4, sm: 6, md: 8, lg: 10, xl: 14, full: 9999 } as const;
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
  raised: { elevation: 6, light: '0 16px 40px rgba(23, 32, 51, 0.12)', dark: '0 8px 24px rgba(0, 0, 0, 0.45)' },
  sheet: { elevation: 12, light: '0 -16px 40px rgba(23, 32, 51, 0.12)', dark: '0 -8px 32px rgba(0, 0, 0, 0.5)' },
} as const;
// Loaded at startup in the root layout; names match the Tailwind font-family utilities.
// The design system specifies Readex Pro; Inter stays until that dependency is approved.
export const fonts = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold',
} as const;
