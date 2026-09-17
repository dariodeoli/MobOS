/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Tema por CSS vars (paleta clara en :root, oscura en html.dark) ──
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        fore: 'rgb(var(--c-fore) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
        },
        // Verde MobOS de marca
        fono: {
          DEFAULT: 'rgb(var(--c-fono) / <alpha-value>)',
          dark: 'rgb(var(--c-fono-dark) / <alpha-value>)',
          light: 'rgb(var(--c-fono-light) / <alpha-value>)',
          glow: 'rgb(var(--c-fono-glow) / <alpha-value>)',
          soft: 'rgba(5,241,156,.12)',
        },
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        bad: 'rgb(var(--c-bad) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
        reserved: 'rgb(var(--c-reserved) / <alpha-value>)',
        // Texto
        mute: 'rgb(var(--c-mute) / <alpha-value>)',
        // Texto oscuro sobre verde de marca (en ambos temas)
        onbrand: 'rgb(var(--c-onbrand) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,.10)',
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
