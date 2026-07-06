/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        surface2: 'hsl(var(--surface2) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        ink: 'hsl(var(--ink) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        faint: 'hsl(var(--faint) / <alpha-value>)',
        gold: 'hsl(var(--gold) / <alpha-value>)',
        goldsoft: 'hsl(var(--goldsoft) / <alpha-value>)',
        ok: 'hsl(var(--ok) / <alpha-value>)',
        warn: 'hsl(var(--warn) / <alpha-value>)',
        risk: 'hsl(var(--risk) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'trace': { '0%': { backgroundColor: 'hsl(var(--gold) / 0.18)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'trace': 'trace 1s ease-out',
      },
    },
  },
  plugins: [],
}
