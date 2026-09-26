import { useEffect, useState } from 'react'

// #267 · Menú interno de Configuración: la preferencia de colapso es del
// dispositivo (localStorage) y se lee antes del primer pintado para que el
// riel no cambie de ancho después (sin saltos). El evento sincroniza todas las
// instancias y pestañas abiertas; `storage` cubre el cambio desde otra pestaña.
const CLAVE = 'mobos:config-menu'
const EVENTO = 'mobos:config-menu-cambio'

export const ESTADOS_MENU_CONFIG = ['expandido', 'colapsado']

/** Último uso = predeterminado; sin dato o sin almacenamiento, expandido. */
export function menuConfigColapsado() {
  try {
    return window.localStorage.getItem(CLAVE) === 'colapsado'
  } catch {
    return false
  }
}

export function guardarMenuConfigColapsado(colapsado) {
  const valor = Boolean(colapsado)
  try {
    window.localStorage.setItem(CLAVE, valor ? 'colapsado' : 'expandido')
    window.dispatchEvent(new Event(EVENTO))
  } catch {
    /* sin almacenamiento: la preferencia vive solo en memoria */
  }
  return valor
}

export function useMenuConfigColapsado() {
  const [colapsado, setColapsado] = useState(menuConfigColapsado)
  useEffect(() => {
    const actualizar = () => setColapsado(menuConfigColapsado())
    window.addEventListener(EVENTO, actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener(EVENTO, actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [])
  return [colapsado, (valor) => setColapsado(guardarMenuConfigColapsado(valor))]
}
