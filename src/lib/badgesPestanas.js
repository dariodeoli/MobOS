import { useSyncExternalStore } from 'react'

// #357 · Contadores de pestañas del shell publicados por la pantalla que los
// conoce (p. ej. Stock publica las autorizaciones pendientes de «Control»).
// La clave es `<sección>:<grupo>`. Un contador en 0 o inválido se borra.
let badges = {}
const oyentes = new Set()

export const claveBadge = (seccion, grupo) => `${seccion}:${grupo}`

export function publicarBadgePestana(clave, cuenta) {
  const n = Math.floor(Number(cuenta))
  const valor = Number.isFinite(n) && n > 0 ? n : 0
  if ((badges[clave] || 0) === valor) return
  const siguiente = { ...badges }
  if (valor) siguiente[clave] = valor
  else delete siguiente[clave]
  badges = siguiente
  oyentes.forEach(oyente => oyente())
}

const suscribir = oyente => {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export const leerBadgesPestanas = () => badges

export function useBadgesPestanas() {
  return useSyncExternalStore(suscribir, leerBadgesPestanas, leerBadgesPestanas)
}
