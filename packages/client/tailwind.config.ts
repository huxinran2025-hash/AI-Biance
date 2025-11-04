import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          light: 'hsl(var(--primary-light))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--foreground))',
        },
        profit: 'hsl(var(--profit))',
        loss: 'hsl(var(--loss))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
      },
      boxShadow: {
        panel: '0 1px 0 rgba(0,0,0,.02), 0 8px 24px rgba(106,0,225,.04)',
      },
    },
  },
  plugins: [],
} satisfies Config

