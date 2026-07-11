/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Dark theme palette — Tailwind slate-based
      colors: {
        border:     'hsl(215 20% 26%)',       // slate-700
        input:      'hsl(215 20% 26%)',
        ring:       'hsl(160 84% 39%)',       // emerald-500 ring
        background: 'hsl(222 47% 7%)',        // ~ slate-950
        foreground: 'hsl(210 20% 96%)',       // ~ slate-100
        primary: {
          DEFAULT:    'hsl(160 84% 39%)',     // emerald-600
          foreground: 'hsl(0 0% 100%)',
        },
        secondary: {
          DEFAULT:    'hsl(215 20% 26%)',     // slate-700
          foreground: 'hsl(210 20% 96%)',
        },
        destructive: {
          DEFAULT:    'hsl(0 72% 51%)',       // red-600
          foreground: 'hsl(0 0% 100%)',
        },
        muted: {
          DEFAULT:    'hsl(215 20% 26%)',
          foreground: 'hsl(217 10% 65%)',
        },
        accent: {
          DEFAULT:    'hsl(215 20% 26%)',
          foreground: 'hsl(210 20% 96%)',
        },
        card: {
          DEFAULT:    'hsl(222 47% 11%)',     // ~ slate-900
          foreground: 'hsl(210 20% 96%)',
        },
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.375rem',
        sm: '0.25rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
