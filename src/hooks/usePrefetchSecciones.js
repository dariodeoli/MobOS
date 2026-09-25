import { useEffect } from 'react'

// #247 · La segunda pantalla, instantánea: con la sección actual ya pintada y
// el equipo ocioso se adelantan los chunks de las secciones más usadas (los
// mismos que la navegación cargaría igual, y que el service worker no cachea
// por adelantado). Se hace una vez por carga de la app y solo si la conexión lo
// permite: en 2G/save-data no se adelanta nada y, si un import falla, la
// navegación normal lo resuelve igual.
const DEMORA_MS = 2500

const PERFILES = {
  vendedor: [
    () => import('@/components/ventas/VistaCargarVenta'),
    () => import('@/components/ventas/SellerOrders'),
    () => import('@/components/ventas/SellerCustomers'),
  ],
  dueno: [
    () => import('@/components/ventas/VistaCargarVenta'),
    () => import('@/components/ventas/SellerOrders'),
    () => import('@/components/ventas/SellerCustomers'),
    () => import('@/components/control/Inventario'),
  ],
  tecnico: [
    () => import('@/components/control/ServicioGarantias'),
  ],
}

let yaLanzado = false

function conexionPermite() {
  if (typeof navigator === 'undefined') return false
  if (navigator.onLine === false) return false
  const con = navigator.connection
  if (!con) return true
  if (con.saveData) return false
  return !/^(slow-)?2g$/.test(con.effectiveType || '')
}

export function usePrefetchSecciones(perfil) {
  useEffect(() => {
    if (yaLanzado || !perfil || typeof window === 'undefined') return undefined
    if (!conexionPermite()) return undefined
    let cancelado = false
    const temporizador = window.setTimeout(() => {
      const lanzar = () => {
        if (cancelado || yaLanzado || !conexionPermite()) return
        yaLanzado = true
        const cargas = (PERFILES[perfil] || []).map((cargar) => cargar().catch(() => null))
        Promise.allSettled(cargas).then(() => {
          window.dispatchEvent(new CustomEvent('mobos:prefetch-listo'))
        })
      }
      if (window.requestIdleCallback) window.requestIdleCallback(lanzar, { timeout: DEMORA_MS })
      else lanzar()
    }, DEMORA_MS)
    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
    }
  }, [perfil])
}
