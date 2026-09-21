import { useEffect, useState } from 'react'

// Patrón transversal (#209): la última selección usada queda como
// predeterminada. Solo para selecciones frecuentes (plantillas de WhatsApp,
// filtros de listados, formatos, etc.): nunca para configuraciones destructivas
// ni permisos, siempre visible en pantalla y siempre cambiable.
//
// Claves namespaced: `mobos:ultimo:<clave>`. Si no hay valor guardado se usa
// el default sensato que pasa cada pantalla.
const PREFIJO = 'mobos:ultimo:'

export const claveUltimo = (clave) => `${PREFIJO}${String(clave || '').trim()}`

export function leerUltimo(clave, inicial = '') {
  try {
    if (typeof localStorage === 'undefined') return inicial
    const valor = localStorage.getItem(claveUltimo(clave))
    return valor === null || valor === '' ? inicial : valor
  } catch {
    return inicial
  }
}

export function recordarUltimo(clave, valor) {
  try {
    if (typeof localStorage === 'undefined') return
    if (valor === null || valor === undefined || valor === '') localStorage.removeItem(claveUltimo(clave))
    else localStorage.setItem(claveUltimo(clave), String(valor))
  } catch {
    /* sin almacenamiento disponible: la pantalla sigue con su default */
  }
}

// Hook: valor recordado + setter que además persiste el cambio.
export function useUltimoUsado(clave, inicial = '') {
  const [valor, setValor] = useState(() => leerUltimo(clave, inicial))
  useEffect(() => { setValor(leerUltimo(clave, inicial)) }, [clave, inicial])
  const elegir = (siguiente) => {
    setValor(siguiente)
    recordarUltimo(clave, siguiente)
  }
  return [valor, elegir]
}
