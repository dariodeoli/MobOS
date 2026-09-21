// Patrón #209: el "último usado" como predeterminado en selecciones frecuentes.
// Solo para selecciones (motivos, sucursal/depósito, filtros), nunca para
// acciones destructivas ni permisos. El valor vive en el navegador
// (localStorage namespaced), es siempre cambiable y la pantalla avisa cuando
// recordó algo. Ver docs/PLANTILLA-OBJETOS.md §7.
import { useCallback, useEffect, useState } from 'react'

const PREFIJO = 'mobos:ultimo:'
export const EVENTO_ULTIMO_USADO = 'mobos:ultimo-usado'

/** Valor recordado para una clave (o el inicial si no hay nada guardado). */
export function leerUltimo(clave, inicial = '') {
  try {
    const guardado = localStorage.getItem(PREFIJO + clave)
    return guardado === null || guardado === '' ? inicial : guardado
  } catch {
    return inicial
  }
}

/** Guarda el último valor usado; vacío = olvidar la clave. */
export function recordarUltimo(clave, valor) {
  try {
    if (valor === null || valor === undefined || valor === '') localStorage.removeItem(PREFIJO + clave)
    else localStorage.setItem(PREFIJO + clave, String(valor))
  } catch {
    // Sin persistencia el valor vale para esta pestaña.
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_ULTIMO_USADO, { detail: { clave } }))
  } catch {
    // Entorno sin window (tests puros): no hay nada que avisar.
  }
}

/** Hook [valor, guardar]: se mantiene sincronizado entre componentes y pestañas. */
export function useUltimoUsado(clave, inicial = '') {
  const [valor, setValor] = useState(() => leerUltimo(clave, inicial))
  useEffect(() => {
    const actualizar = () => setValor(leerUltimo(clave, inicial))
    window.addEventListener(EVENTO_ULTIMO_USADO, actualizar)
    window.addEventListener('storage', actualizar)
    return () => {
      window.removeEventListener(EVENTO_ULTIMO_USADO, actualizar)
      window.removeEventListener('storage', actualizar)
    }
  }, [clave, inicial])
  const guardar = useCallback(siguiente => {
    recordarUltimo(clave, siguiente)
    setValor(siguiente === null || siguiente === undefined ? '' : String(siguiente))
  }, [clave])
  return [valor, guardar]
}
