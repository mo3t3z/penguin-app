const names = ['background', 'foreground', 'card', 'card-foreground', 'muted', 'muted-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'accent', 'accent-foreground', 'border', 'input', 'ring', 'destructive', 'destructive-foreground', 'success', 'warning'];
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map(name => [name, `rgb(var(--${name}) / <alpha-value>)`])),
      borderRadius: { sm: '8px', md: '12px', lg: '20px', xl: '24px' },
      fontSize: {
        caption: ['12px', '16px'], metadata: ['14px', '20px'], body: ['16px', '24px'],
        lead: ['18px', '26px'], heading: ['22px', '28px'], title: ['28px', '34px'], display: ['34px', '40px'],
      },
    },
  },
  plugins: [],
};
