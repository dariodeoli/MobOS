import { useEffect, useState } from 'react'
import { APP_NAME } from '@/lib/brand'

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export default function ThemeLogo({ className }) {
  const [dark, setDark] = useState(isDark)

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return <img src={dark ? '/logo-dark.svg' : '/logo.svg'} alt={APP_NAME} className={className} />
}
