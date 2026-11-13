/** @type {import('tailwindcss').Config} */
// Janchi brand for everything around the POS (the POS screen keeps the real BLUU look):
// warm charcoal neutrals ("slate") and Janchi red ("sky", the accent used across the UI).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#faf7f2',
          100: '#f3eee7',
          200: '#e4ddd3',
          300: '#cbc2b7',
          400: '#a59c91',
          500: '#7f776e',
          600: '#5c5650',
          700: '#3f3b37',
          800: '#2b2826',
          900: '#1e1c1b',
          950: '#141312',
        },
        sky: {
          50: '#fdf2f3',
          100: '#fbe3e5',
          200: '#f6c5ca',
          300: '#f0a1a9',
          400: '#e3606e',
          500: '#d33445',
          600: '#be1e2d',
          700: '#9f1825',
          800: '#831622',
          900: '#6e1621',
          950: '#3d070d',
        },
        janchi: '#be1e2d',
      },
    },
  },
  plugins: [],
};
