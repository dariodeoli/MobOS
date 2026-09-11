/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Tema oscuro ────────────────────────────────────────────────
        // Fondos: negro real → superficies elevadas
        ink: {
          DEFAULT: '#08090B', // fondo de la app
          800: '#0E1013', // superficie base (cards)
          700: '#15181D', // superficie elevada (hover, headers)
          600: '#1D2127', // bordes suaves / inputs
          500: '#2A2F37', // bordes
        },
        // Verde MobOS de marca
        fono: {
          DEFAULT: '#15D7B8',
          dark: '#0E8F88',
          light: '#72F3D6',
          glow: '#15D7B8',
          soft: 'rgba(21,215,184,.12)', // fondo tenue para chips/activos
        },
        ok: '#22C55E',
        bad: '#EF4444',
        warn: '#F59E0B',
        // Texto
        mute: '#8A93A3',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
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
