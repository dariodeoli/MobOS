// Cola local de ventas del POS (offline-first, Fase 1).
//
// Lógica pura: el almacenamiento y el envío se inyectan, así se prueba sin
// IndexedDB ni red. La cola guarda la venta completa con su Idempotency-Key:
// sincronizar la misma venta dos veces (o reintentar tras un corte) reutiliza la
// orden ya creada en el backend, nunca la duplica.
//
// Estados de un ítem:
// - `pendiente`: esperando conexión (o reintento tras un error de red).
// - `enviada`: el backend confirmó la orden (se conserva como historial acotado).
// - `conflicto`: el backend la rechazó (dato inválido, permiso, etc.): necesita
//   una persona; no se reintenta sola para no martillar el servidor.

export const ESTADO_PENDIENTE = 'pendiente'
export const ESTADO_ENVIADA = 'enviada'
export const ESTADO_CONFLICTO = 'conflicto'

// Un error "de red" es el que se resuelve reintentando: sin respuesta del
// servidor (status 0) o timeout. Un 4xx/5xx ya es una respuesta del backend.
export function esErrorDeRed(error) {
  if (!error) return false
  const status = Number(error.status ?? error.statusCode ?? 0)
  if (status > 0) return false
  const code = String(error.code || '')
  if (code === 'NETWORK_ERROR' || code === 'REQUEST_TIMEOUT' || code === 'REQUEST_ABORTED') return true
  // Un fetch que no llega a responder también se ve como TypeError.
  return error.name === 'TypeError' || error.name === 'AbortError'
}

const resumenDe = (item) => item?.resumen || null

export function crearColaDeVentas({ store, enviar, ahora = () => Date.now(), maxHistorial = 50 }) {
  async function listar() {
    const items = await store.listar()
    return [...items].sort((a, b) => Number(a.creadoEn || 0) - Number(b.creadoEn || 0))
  }

  // Encola una venta que no se pudo enviar. El payload viaja tal cual (con
  // `offline: true`): el backend relaja el stock y la marca para revisión.
  async function encolar({ payload, idempotencyKey, resumen }) {
    if (!payload || typeof payload !== 'object') throw new Error('La venta a encolar es obligatoria.')
    if (!idempotencyKey) throw new Error('La venta a encolar necesita su Idempotency-Key.')
    const item = {
      id: `cola-${ahora().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      idempotencyKey,
      payload,
      resumen: resumenDe({ resumen }) || null,
      estado: ESTADO_PENDIENTE,
      intentos: 0,
      error: '',
      creadoEn: ahora(),
      sincronizadaEn: null,
    }
    await store.guardar(item)
    return item
  }

  async function pendientes() {
    return (await listar()).filter((item) => item.estado === ESTADO_PENDIENTE)
  }

  // Sincroniza la cola: envía los pendientes en orden de creación. Un error de
  // red deja el ítem pendiente (se reintenta al reconectar); cualquier otra
  // respuesta lo marca como conflicto para que lo revise una persona.
  async function sincronizar() {
    const items = await pendientes()
    for (const item of items) {
      try {
        const orden = await enviar(item)
        await store.guardar({ ...item, estado: ESTADO_ENVIADA, error: '', sincronizadaEn: ahora(), ordenId: orden?.id || null })
      } catch (error) {
        if (esErrorDeRed(error)) {
          await store.guardar({ ...item, intentos: Number(item.intentos || 0) + 1, error: 'Sin conexión con el servidor.' })
          break // sin red no tiene sentido seguir con el resto
        }
        await store.guardar({ ...item, estado: ESTADO_CONFLICTO, error: error?.message || 'El servidor rechazó la venta.' })
      }
    }
    await limpiarHistorial()
    return resumen()
  }

  // Un conflicto se puede reintentar a mano (por ejemplo si el dato se corrigió
  // o el permiso ya está): vuelve a pendiente sin perder el payload.
  async function reintentar(id) {
    const item = (await store.listar()).find((row) => row.id === id)
    if (!item) return null
    const siguiente = { ...item, estado: ESTADO_PENDIENTE, intentos: 0, error: '' }
    await store.guardar(siguiente)
    return siguiente
  }

  async function descartar(id) {
    await store.borrar(id)
  }

  // El historial de enviadas se conserva acotado (solo para mostrar la última
  // sincronización y para diagnóstico): los pendientes y conflictos no se tocan.
  async function limpiarHistorial() {
    const enviadas = (await listar()).filter((item) => item.estado === ESTADO_ENVIADA)
    const sobran = enviadas.length - Math.max(0, maxHistorial)
    for (const item of enviadas.slice(0, Math.max(0, sobran))) await store.borrar(item.id)
  }

  async function resumen() {
    const items = await listar()
    const pendientesTotal = items.filter((item) => item.estado === ESTADO_PENDIENTE).length
    const conflictos = items.filter((item) => item.estado === ESTADO_CONFLICTO).length
    const ultimaSync = items.reduce((max, item) => Math.max(max, Number(item.sincronizadaEn || 0)), 0)
    return {
      pendientes: pendientesTotal,
      conflictos,
      enviadas: items.filter((item) => item.estado === ESTADO_ENVIADA).length,
      ultimaSync: ultimaSync || null,
      total: items.length,
    }
  }

  return { encolar, listar, pendientes, sincronizar, reintentar, descartar, resumen }
}
