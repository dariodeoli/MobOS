import { useEffect, useState } from 'react'

// Vista previa del rediseño v2 (#241): por dispositivo y apagada por defecto.
// Se prende desde el menú de acciones ( "Vista previa v2" ) y solo afecta a las
// pantallas del piloto (inventario, ficha y carrito). El default no cambia y el
// rollout real lo define la aprobación de Dario.

const CLAVE = 'mobos:tema-v2'

// Switch de activación del default v2 (#241). **Apagado**: el rediseño se ve
// solo con la vista previa activada por dispositivo. Cuando Dario apruebe, se
// pasa a `true` y el v2 queda por defecto para todos, con salida opt-out por
// dispositivo (`localStorage['mobos:tema-v2'] = '0'`).
export const TEMA_V2_POR_DEFECTO = false
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
