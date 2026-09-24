import { useEffect, useState } from 'react'

// Rediseño v2 (#241): ACTIVADO por defecto desde la aprobación del rollout.
// Cada dispositivo puede volver al diseño anterior con la salida opt-out
// (`localStorage['mobos:tema-v2'] = '0'`).

const CLAVE = 'mobos:tema-v2'

// Switch de activación del default v2 (#241). **Prendido** desde la aprobación
// del rollout: el v2 es el diseño por defecto y cada dispositivo puede salir
// con `localStorage['mobos:tema-v2'] = '0'`.
export const TEMA_V2_POR_DEFECTO = true
const EVENTO = 'mobos:tema-v2-cambio'

export function temaV2Activo() {
  try {
    const guardado = window.localStorage.getItem(CLAVE)
    if (guardado === '1') return true
    if (guardado === '0') return false
    return TEMA_V2_POR_DEFECTO
  } catch { return TEMA_V2_POR_DEFECTO }
}

export function activarTemaV2(activo) {
  try {
    window.localStorage.setItem(CLAVE, activo ? '1' : '0')
    window.dispatchEvent(new Event(EVENTO))
  } catch { /* sin almacenamiento */ }
}

export function useTemaV2() {
  const [activo, setActivo] = useState(temaV2Activo)
  useEffect(() => {
    const actualizar = () => setActivo(temaV2Activo())
    window.addEventListener(EVENTO, actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener(EVENTO, actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [])
  return activo
}
