import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // "Momentum" — dark, with an electric indigo→violet accent. Base bg is
        // kept at #0b0d10 because it's mirrored in globals.css, the PWA
        // theme-color, and manifest.webmanifest; elevation is deepened instead.
        // Every accent/pass/fail keeps a `DEFAULT` so existing flat classes
        // (bg-accent, text-pass, border-fail/40, active:bg-accent-soft) still work.
        bg: '#0b0d10',
        surface: '#14161c',
        surface2: '#1c1f27',
        surface3: '#262a34', // hero cards, chart panels, sheets
        border: '#2a2f3a',
        'border-strong': '#3a4150',

        accent: {
          DEFAULT: '#6366f1',
          50: '#eef0ff',
          100: '#e0e2ff',
          200: '#c6c9ff',
          300: '#a5a8ff',
          400: '#8b8cff',
          500: '#6366f1',
          600: '#5457e0',
          700: '#4338ca',
          800: '#372fa8',
          900: '#2e2a83',
        },
        'accent-soft': '#4338ca',
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },

        pass: { DEFAULT: '#22c55e', soft: '#16a34a' },
        fail: { DEFAULT: '#ef4444', soft: '#dc2626' },
        warn: '#f59e0b',
        // Rest-day exception marker — a neon pink that stands apart from
        // pass/fail/accent on the calendars and heatmaps.
        exception: '#ff2d95',

        text: {
          primary: '#e8eaed',
          secondary: '#b6bcc4',
          muted: '#7c828c',
          faint: '#565b64',
        },
      },
      fontFamily: {
        body: [
          'var(--font-body)',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        display: [
          'var(--font-display)',
          'var(--font-body)',
          'system-ui',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        btn: '10px',
        lg: '20px',
        pill: '999px',
      },
      boxShadow: {
        'glow-accent': '0 0 24px -4px rgba(99,102,241,0.55)',
        'glow-pass': '0 0 24px -4px rgba(34,197,94,0.5)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'accent-grad': 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 60%,#a855f7 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
