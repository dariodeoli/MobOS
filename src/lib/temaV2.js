import { useEffect, useState } from 'react'

// Rediseño v2 (#241 · F4): el switch de activación vive en `VITE_TEMA_V2`.
// - `VITE_TEMA_V2=0` → apagado: el v2 se prueba por dispositivo con
//   `localStorage['mobos:tema-v2'] = '1'`.
// - `VITE_TEMA_V2=1` o sin definir → prendido: el v2 es el diseño por defecto.
// El valor por dispositivo siempre manda: `mobos:tema-v2='0'` vuelve al diseño
// anterior y `'1'` regresa al v2.

const CLAVE = 'mobos:tema-v2'
const EVENTO = 'mobos:tema-v2-cambio'

/** Default del rollout según el entorno de build (prendido salvo `'0'`). */
export function temaV2PorDefecto(env = import.meta.env) {
  return String(env?.VITE_TEMA_V2 ?? '').trim() !== '0'
}

export const TEMA_V2_POR_DEFECTO = temaV2PorDefecto()

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
