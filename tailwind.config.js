/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './extension/src/**/*.{js,ts,jsx,tsx}',
    './extension/public/**/*.html',
  ],
  theme: {
    extend: {
      colors: {
        'terminal-green': '#39ff14',
        'terminal-dim': '#1b4d13',
        'terminal-dark': '#0a0a0a',
        'panel': '#111111',
        'alert-red': '#ff0055',
      },
      fontFamily: {
        mono: ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(57, 255, 20, 0.6)' },
          '50%': { boxShadow: '0 0 20px rgba(57, 255, 20, 0.9)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
};
