// Tema claro/oscuro: una sola implementación para la barra (ThemeToggle) y
// para Preferencias, así el cambio se refleja en todos lados.
export const TEMA_KEY = 'mobos:theme'
const THEME_COLOR_LIGHT = '#f6f8fb'
const THEME_COLOR_DARK = '#090d16'

export function temaOscuro() {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

export function aplicarTema(oscuro) {
  document.documentElement.classList.toggle('dark', oscuro)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = oscuro ? THEME_COLOR_DARK : THEME_COLOR_LIGHT
  try {
    localStorage.setItem(TEMA_KEY, oscuro ? 'dark' : 'light')
  } catch {
    // Sin persistencia el tema vale para esta pestaña.
  }
}
