/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Marca Fono Mobile
        fono: {
          DEFAULT: '#1A2768',
          dark: '#0f1d52',
          light: '#eef0f8',
          accent: '#2355c0',
        },
        ok: '#10B981',
        bad: '#EF4444',
        warn: '#F59E0B',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(26,39,104,.08), 0 1px 3px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [],
}
