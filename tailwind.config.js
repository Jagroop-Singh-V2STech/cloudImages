/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe6fe', 200: '#bfd3fe', 300: '#93b4fd', 400: '#6090fa',
          500: '#3b6cf6', 600: '#2550eb', 700: '#1d3fd8', 800: '#1e36af', 900: '#1e338a',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        lift: '0 12px 28px -8px rgb(15 23 42 / 0.18), 0 4px 10px -4px rgb(15 23 42 / 0.10)',
        float: '0 24px 60px -12px rgb(15 23 42 / 0.35)',
      },
    },
  },
  plugins: [],
};
