import type { Config } from 'tailwindcss'

const config: Config = {

  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        light: {
          bg: '#ffffff',
          surface: '#f5f5f5',
          border: '#e5e5e5',
          text: '#1a1a1a',
          'text-secondary': '#666666',
          accent: '#0066ff',
          'accent-hover': '#0052cc',
        },
        dark: {
          bg: '#1a1a1a',
          surface: '#2a2a2a',
          border: '#3a3a3a',
          text: '#ffffff',
          'text-secondary': '#999999',
          accent: '#3388ff',
          'accent-hover': '#5599ff',
        },
        tool: {
          pen: '#3b82f6',
          text: '#10b981',
          shapes: '#f59e0b',
          image: '#8b5cf6',
          eraser: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      borderRadius: {
        chip: '9999px',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(0, 0, 0, 0.08)',
        'soft-dark': '0 2px 8px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
}

export default config
