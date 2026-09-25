// #250 · Repuestos del taller: tenencia (propio / de proveedor) y pago (contado,
// crédito o consignación), con dueño explícito y disponibles para el taller sin
// mezclarse con el stock vendible. Lógica pura y testeable; las rutas solo
// persisten.

export const TENENCIAS = ['PROPIO', 'PROVEEDOR'] as const
export type Tenencia = (typeof TENENCIAS)[number]
export const TENENCIA_LABEL: Record<Tenencia, string> = { PROPIO: 'Propio', PROVEEDOR: 'Del proveedor' }

export const PAGOS_REPUESTO = ['CONTADO', 'CREDITO', 'CONSIGNACION'] as const
export type PagoRepuesto = (typeof PAGOS_REPUESTO)[number]
export const PAGO_LABEL: Record<PagoRepuesto, string> = { CONTADO: 'Contado', CREDITO: 'A crédito', CONSIGNACION: 'Consignación' }

export const ESTADOS_REPUESTO = ['DISPONIBLE', 'AGOTADO', 'DEVUELTO', 'BAJA'] as const
export type EstadoRepuesto = (typeof ESTADOS_REPUESTO)[number]

export const MOVIMIENTOS_REPUESTO = ['ALTA', 'USO', 'DEVOLUCION', 'PAGO', 'BAJA', 'AJUSTE'] as const
export type MovimientoRepuesto = (typeof MOVIMIENTOS_REPUESTO)[number]

const entero = (valor: unknown) => Number.isSafeInteger(Number(valor)) ? Number(valor) : null

/** Código del repuesto en el taller: REP-#0001 (secuencia por empresa). */
export function codigoRepuesto(secuencia: number): string {
  return `REP-#${String(Math.max(1, Math.round(Number(secuencia) || 1))).padStart(4, '0')}`
}

/**
 * Valida el alta de un repuesto: el dueño y el pago tienen que ser coherentes
 * (lo del proveedor necesita proveedor; la consignación es del proveedor; el
 * contado no puede quedar con vencimiento).
 */
export function validarRepuesto(input: { ownership?: unknown; paymentMode?: unknown; supplierId?: unknown; quantity?: unknown; unitCostPyg?: unknown; totalCostPyg?: unknown; dueAt?: unknown } = {}): { error?: string } {
  const tenencia = String(input.ownership ?? 'PROPIO').toUpperCase()
  const pago = String(input.paymentMode ?? 'CONTADO').toUpperCase()
  if (!(TENENCIAS as readonly string[]).includes(tenencia)) return { error: `Tenencia inválida: usá ${TENENCIAS.join(' o ')}.` }
  if (!(PAGOS_REPUESTO as readonly string[]).includes(pago)) return { error: `Forma de pago inválida: usá ${PAGOS_REPUESTO.join(', ')}.` }
  if (tenencia === 'PROVEEDOR' && !input.supplierId) return { error: 'Un repuesto del proveedor necesita el proveedor (dueño explícito).' }
  if (pago === 'CONSIGNACION' && tenencia !== 'PROVEEDOR') return { error: 'La consignación es una tenencia del proveedor.' }
  if (pago === 'CONTADO' && input.dueAt) return { error: 'Un repuesto contado no lleva vencimiento.' }
  const cantidad = entero(input.quantity)
  if (cantidad === null || cantidad < 1 || cantidad > 9999) return { error: 'La cantidad debe ser un entero entre 1 y 9999.' }
  for (const [campo, valor] of [['unitario', input.unitCostPyg], ['total', input.totalCostPyg]] as const) {
    if (valor === undefined || valor === null || valor === '') continue
    const monto = entero(valor)
    if (monto === null || monto < 0 || monto > 2147483647) return { error: `El costo ${campo} debe ser un entero entre 0 y 2.147.483.647.` }
  }
  return {}
}

/** Estado del repuesto según lo que queda y su situación (no lo elige la UI). */
export function estadoRepuesto(part: { status?: string | null; quantity?: number | null } = {}): EstadoRepuesto {
  const actual = String(part.status || '').toUpperCase()
  if (actual === 'DEVUELTO' || actual === 'BAJA') return actual
  return Math.max(0, Number(part.quantity) || 0) > 0 ? 'DISPONIBLE' : 'AGOTADO'
}

/** ¿Este repuesto genera una deuda con el proveedor de la compra? */
export function esPorPagar(part: { paymentMode?: string | null; paidAt?: unknown; usedQuantity?: number | null } = {}): boolean {
  if (part.paidAt) return false
  const pago = String(part.paymentMode || 'CONTADO').toUpperCase()
  if (pago === 'CONTADO') return false
  // La consignación se paga recién por lo que se usa; el crédito, desde el alta.
  if (pago === 'CONSIGNACION') return Math.max(0, Number(part.usedQuantity) || 0) > 0
  return true
}

/** Deuda del repuesto en guaraníes (crédito: lo comprado; consignación: lo usado). */
export function deudaRepuesto(part: { paymentMode?: string | null; paidAt?: unknown; quantity?: number | null; usedQuantity?: number | null; unitCostPyg?: number | null; totalCostPyg?: number | null } = {}): number {
  if (!esPorPagar(part)) return 0
  const pago = String(part.paymentMode || 'CONTADO').toUpperCase()
  const unitario = Math.max(0, Number(part.unitCostPyg) || 0)
  if (pago === 'CONSIGNACION') return unitario * Math.max(0, Number(part.usedQuantity) || 0)
  const total = part.totalCostPyg === null || part.totalCostPyg === undefined ? null : Math.max(0, Number(part.totalCostPyg) || 0)
  if (total !== null && total > 0) return total
  return unitario * Math.max(0, Number(part.quantity) || 0)
}

/** Resumen para el panel y para FIN (cuentas por pagar del taller). */
export function resumenRepuestos(parts: Array<{ ownership?: string | null; paymentMode?: string | null; paidAt?: unknown; quantity?: number | null; usedQuantity?: number | null; unitCostPyg?: number | null; totalCostPyg?: number | null; status?: string | null; dueAt?: string | Date | null; supplierId?: string | null }> = [], { ahora = new Date() }: { ahora?: Date | string } = {}): { total: number; disponibles: number; propios: number; deProveedor: number; porPagar: number; porPagarPyg: number; vencidas: number; vencidasPyg: number; unidadesDisponibles: number } {
  const referencia = new Date(ahora).getTime()
  const resumen = { total: parts.length, disponibles: 0, propios: 0, deProveedor: 0, porPagar: 0, porPagarPyg: 0, vencidas: 0, vencidasPyg: 0, unidadesDisponibles: 0 }
  for (const part of parts) {
    const estado = estadoRepuesto(part)
    if (estado === 'DISPONIBLE') { resumen.disponibles += 1; resumen.unidadesDisponibles += Math.max(0, Number(part.quantity) || 0) }
    if (String(part.ownership || 'PROPIO').toUpperCase() === 'PROVEEDOR') resumen.deProveedor += 1
    else resumen.propios += 1
    const deuda = deudaRepuesto(part)
    if (deuda > 0) {
      resumen.porPagar += 1
      resumen.porPagarPyg += deuda
      const vence = part.dueAt ? new Date(part.dueAt as string).getTime() : null
      if (vence !== null && !Number.isNaN(vence) && vence < referencia) { resumen.vencidas += 1; resumen.vencidasPyg += deuda }
    }
  }
  return resumen
}
