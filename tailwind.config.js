/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Tema oscuro ────────────────────────────────────────────────
        // Fondos: negro real → superficies elevadas
        ink: {
          DEFAULT: '#090D16',
          800: '#101722',
          700: '#172131',
          600: '#263448',
          500: '#3A4D67',
        },
        // Verde MobOS de marca
        fono: {
          DEFAULT: '#05F19C',
          dark: '#04B978',
          light: '#7CFFC9',
          glow: '#05F19C',
          soft: 'rgba(5,241,156,.12)',
        },
        ok: '#22C55E',
        bad: '#EF4444',
        warn: '#F59E0B',
        // Texto
        mute: '#8A93A3',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.4)',
        glow: '0 0 40px -10px rgba(21,215,184,.45)',
      },
      backgroundImage: {
        // Verde MobOS para encabezados y tarjetas destacadas
        'blue-blur': 'radial-gradient(120% 140% at 0% 0%, #15D7B8 0%, #12636c 45%, #0E1013 100%)',
        'blue-line': 'linear-gradient(90deg, #15D7B8, #72F3D6)',
      },
    },
  },
  plugins: [],
}
