// Cola de ventas offline del POS: une la lógica pura de `queue.js` con
// IndexedDB y el envío real de la orden (mismo POST y misma Idempotency-Key que
// el modo online). Expone un aviso a los suscriptores para que el indicador se
// actualice solo cuando algo cambia.
import { guardarOrdenApi } from '@/lib/storage'
import { crearColaDeVentas } from './queue'
import { crearStoreDeCola } from './idb'

let cola = null
const oyentes = new Set()

export function colaDeVentas() {
  if (!cola) {
    cola = crearColaDeVentas({
      store: crearStoreDeCola(),
      enviar: (item) => guardarOrdenApi(item.payload, { idempotencyKey: item.idempotencyKey }),
    })
  }
  return cola
}

function avisar(resumen) {
  for (const oyente of oyentes) {
    try { oyente(resumen) } catch { /* un oyente roto no corta la cola */ }
  }
}

export function suscribirCola(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export async function resumenCola() {
  return colaDeVentas().resumen()
}

// Deja la venta en la cola local (con `offline: true` en el payload) y avisa.
export async function encolarVenta({ payload, idempotencyKey, resumen }) {
  const item = await colaDeVentas().encolar({ payload, idempotencyKey, resumen })
  avisar(await colaDeVentas().resumen())
  return item
}

export async function sincronizarCola() {
  const resumen = await colaDeVentas().sincronizar()
  avisar(resumen)
  return resumen
}

export async function reintentarVenta(id) {
  const item = await colaDeVentas().reintentar(id)
  avisar(await colaDeVentas().resumen())
  return item
}
