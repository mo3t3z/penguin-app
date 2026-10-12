// Every opaque colour token in src/theme/tokens.ts. Tokens with alpha (nav-surface,
// nav-border, nav-active, overlay) are applied with `style`, not a class.
const names = ['background', 'card', 'surface-raised', 'nav-label', 'muted', 'foreground', 'muted-foreground', 'primary', 'primary-foreground', 'primary-pressed', 'primary-text', 'accent', 'accent-foreground', 'secondary', 'secondary-foreground', 'border', 'divider', 'input', 'focus', 'ring', 'skeleton', 'disabled-foreground', 'success', 'success-surface', 'warning', 'warning-surface', 'destructive', 'destructive-foreground', 'destructive-surface', 'info', 'info-surface'];
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map(name => [name, `rgb(var(--${name}) / <alpha-value>)`])),
      // 14px controls and media, 20px bubbles and floating layers, 24px pill composer.
      // `beak` is the one tight corner on the last bubble, Create tile and send button.
      // 72px rows and empty-state circles; 1.5px control outlines.
      spacing: { 18: '72px' },
      borderWidth: { 1.5: '1.5px' },
      borderRadius: { beak: '6px', sm: '10px', md: '14px', lg: '20px', xl: '24px' },
      // Each Inter weight is its own family on Android, so weights are chosen with
      // these utilities instead of font-medium/font-semibold/font-bold.
      fontFamily: {
        sans: ['Inter_400Regular'], 'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'], 'inter-bold': ['Inter_700Bold'],
      },
      fontSize: {
        display: ['30px', '36px'], 'title-1': ['24px', '30px'], 'title-2': ['20px', '26px'],
        headline: ['17px', '24px'], body: ['16px', '24px'], 'body-ar': ['17px', '28px'],
        callout: ['15px', '22px'], label: ['15px', '20px'], footnote: ['13px', '18px'],
        caption: ['12px', '16px'], micro: ['11px', '14px'],
      },
    },
  },
  plugins: [],
};
