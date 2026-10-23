// Retención de IMEI en el carrito del POS (apartado corto con latido).
// Funciones puras: el contador se calcula con el reloj del SERVIDOR (serverNow),
// nunca con el del celular. El hook que las usa vive en
// components/ventas/usePosRetencion.jsx.

/** Ventana de aviso: por debajo de este tiempo el chip pasa a advertencia. */
export const AVISO_SEGUNDOS = 60
/** Latido del carrito: cada 60 s, solo con la pestaña visible y actividad reciente. */
export const LATIDO_MS = 60_000
export const ACTIVIDAD_MAX_MS = 10 * 60_000

/** Desfase servidor − cliente (ms) medido al recibir una respuesta con serverNow. */
export function desfaseReloj(serverNow, clienteMs = Date.now()) {
  const servidorMs = typeof serverNow === 'number' ? serverNow : Date.parse(serverNow)
  return Number.isFinite(servidorMs) ? servidorMs - clienteMs : 0
}

/** Instante de vencimiento expresado en el reloj local (para comparar con Date.now()). */
export function vencimientoLocal(reservedUntil, desfaseMs = 0) {
  const ms = typeof reservedUntil === 'number' ? reservedUntil : Date.parse(reservedUntil)
  return Number.isFinite(ms) ? ms - desfaseMs : null
}

/** Segundos que quedan (entero, mínimo 0) hasta `vencimientoLocalMs`. */
export function segundosRestantes(vencimientoLocalMs, ahoraMs = Date.now()) {
  if (!Number.isFinite(vencimientoLocalMs)) return 0
  return Math.max(0, Math.ceil((vencimientoLocalMs - ahoraMs) / 1000))
}

/** m:ss (sin ceros a la izquierda en los minutos). */
export function formatoContador(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 'vencido' | 'aviso' (menos de 1 min) | 'ok'. */
export function estadoApartado(segundos) {
  if (segundos <= 0) return 'vencido'
  return segundos < AVISO_SEGUNDOS ? 'aviso' : 'ok'
}

/** «Retenida por Ana · 3:42» para una unidad de otro vendedor (lista del picker). */
export function textoRetenida(unidad, ahoraMs = Date.now()) {
  const desfase = desfaseReloj(unidad?.serverNow, ahoraMs)
  const segundos = segundosRestantes(vencimientoLocal(unidad?.reservedUntil, desfase), ahoraMs)
  const nombre = unidad?.reservedBy?.name || 'otro vendedor'
  return `Retenida por ${nombre} · ${formatoContador(segundos)}`
}

/** ¿Es una retención de carrito viva de otro usuario (no una reserva de cliente)? */
export function retenidaPorOtro(unidad, usuarioId) {
  return unidad?.status === 'RESERVED' && unidad?.reservationKind === 'CART_HOLD' && Boolean(unidad?.reservedBy?.id) && unidad.reservedBy.id !== usuarioId
}

/** El latido solo corre con la pestaña visible, retenciones activas y actividad en los últimos 10 min. */
export function debeLatir({ visible, ultimaActividadMs, ahoraMs = Date.now(), retenciones = 0, enLinea = true }) {
  return Boolean(visible) && enLinea && retenciones > 0 && ahoraMs - ultimaActividadMs <= ACTIVIDAD_MAX_MS
}

/** Aviso suave para productos sin serial: no se retiene cantidad, solo se avisa si queda poco. */
export function avisoQuedan(stock, umbral = 3) {
  const n = Number(stock)
  return Number.isFinite(n) && n > 0 && n <= umbral ? `Quedan ${n}` : ''
}

/** Seriales del carrito (únicos, en orden) para reconciliar contra lo retenido. */
export function serialesDelCarrito(items) {
  const vistos = new Set()
  for (const item of Array.isArray(items) ? items : []) for (const serial of item?.serials || []) if (serial) vistos.add(String(serial))
  return [...vistos]
}

/** Serie de la diferencia: qué retener y qué liberar para que lo retenido coincida con el carrito. */
export function diferenciaDeRetencion(enCarrito, retenidos) {
  const quiero = new Set(enCarrito)
  const tengo = new Set(retenidos)
  return { retener: [...quiero].filter(serial => !tengo.has(serial)), liberar: [...tengo].filter(serial => !quiero.has(serial)) }
}
