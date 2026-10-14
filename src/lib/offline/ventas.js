// Cola de ventas offline del POS: une la lógica pura de `queue.js` con
// IndexedDB y el envío real de la orden (mismo POST y misma Idempotency-Key que
// el modo online). Expone un aviso a los suscriptores para que el indicador se
// actualice solo cuando algo cambia.
import { contextoActual, guardarOrdenApi } from '@/lib/storage'
import { crearColaDeVentas } from './queue'
import { crearStoreDeCola } from './idb'

let cola = null
const oyentes = new Set()

export function colaDeVentas() {
  if (!cola) {
    cola = crearColaDeVentas({
      store: crearStoreDeCola(),
      // Empresa y persona activas del momento: la cola marca cada venta con
      // ellas y solo envía las de la empresa actual (#377).
      contexto: () => {
        const actual = contextoActual()
        return { tenantId: actual.empresaId, userId: actual.userId }
      },
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

export async function listarCola() {
  return colaDeVentas().listar()
}

// Reporte del modo offline (#168): vendido sin conexión, tiempos y conflictos.
export async function reporteCola() {
  return colaDeVentas().reporte()
}

// Limpieza: acota el historial y vence lo que esperó demasiado sin conexión.
export async function limpiarCola() {
  const resumen = await colaDeVentas().limpiar()
  avisar(resumen)
  return resumen
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

export async function descartarVenta(id) {
  const descartada = await colaDeVentas().descartar(id)
  avisar(await colaDeVentas().resumen())
  return descartada
}

// Ventas sin enviar que quedaron en OTRAS empresas de este dispositivo. El
// selector de empresa las informa; no se envían hasta volver a su empresa.
export async function ventasPendientesDeOtraEmpresa() {
  return colaDeVentas().ventasPendientesDeOtraEmpresa()
}

// ¿Quedan ventas sin enviar en la empresa activa? El selector de empresa
// advierte antes de cambiar.
export async function hayPendientesEnEmpresaActual() {
  return colaDeVentas().hayPendientesEnEmpresaActual()
}
