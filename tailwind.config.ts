import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark, minimalist palette. Single indigo accent; green=pass, red=fail.
        bg: '#0b0d10',
        surface: '#16191d',
        surface2: '#1f242b',
        border: '#2a3038',
        accent: '#6366f1',
        'accent-soft': '#4338ca',
        pass: '#22c55e',
        fail: '#ef4444',
        text: {
          primary: '#e8eaed',
          secondary: '#b6bcc4',
          muted: '#7c828c',
        },
      },
      fontFamily: {
        body: [
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      borderRadius: {
        card: '14px',
        btn: '10px',
      },
    },
  },
  plugins: [],
};

export default config;
