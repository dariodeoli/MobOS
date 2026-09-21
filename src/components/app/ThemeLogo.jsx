import { useEffect, useState } from 'react'
import { APP_NAME } from '@/lib/brand'

function isDark() {
  return document.documentElement.classList.contains('dark')
}

// Logo de la marca por tema (regla #163): fondo oscuro → logo claro
// (`/logo-dark.svg`), fondo claro → logo oscuro (`/logo.svg`). `variante`
// permite forzar el fondo cuando la superficie no sigue al tema (p. ej. una
// tarjeta con degradé verde en una app clara).
export default function ThemeLogo({ className, variante }) {
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const sobreOscuro = variante ? variante === 'dark' : dark
  return <img src={sobreOscuro ? '/logo-dark.svg' : '/logo.svg'} alt={APP_NAME} className={className} />
}
