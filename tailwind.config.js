const names = ['background', 'foreground', 'card', 'card-foreground', 'muted', 'muted-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground', 'border', 'input', 'ring', 'skeleton', 'destructive', 'destructive-foreground', 'success', 'warning'];
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map(name => [name, `rgb(var(--${name}) / <alpha-value>)`])),
      // Figma: 8px image corners, 12px controls, 16px cards.
      borderRadius: { sm: '8px', md: '12px', lg: '16px', xl: '24px' },
      // Each Inter weight is its own family on Android, so weights are chosen with
      // these utilities instead of font-medium/font-semibold/font-bold.
      fontFamily: {
        sans: ['Inter_400Regular'], 'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'], 'inter-bold': ['Inter_700Bold'],
      },
      fontSize: {
        micro: ['11px', '14px'], caption: ['12px', '16px'], label: ['13px', '18px'],
        metadata: ['14px', '20px'], body: ['15px', '22px'], lead: ['18px', '24px'],
        heading: ['22px', '28px'], title: ['28px', '34px'], display: ['34px', '40px'],
      },
    },
  },
  plugins: [],
};
