// #250 Fase 1 (Centro de Abastecimiento): necesidades de abastecimiento.
//
// Lógica pura y testeable del panel «Por comprar»: orígenes/prioridades/estados
// válidos, normalización de la carga manual y **consolidación inteligente**
// (agrupa solicitudes idénticas para comprar conservando los destinos — pedido,
// reserva o reposición — y sin mezclar condición, que es la variante a comprar).

export const NECESIDAD_ORIGENES = ['SALE_NO_STOCK', 'RESERVATION_NO_STOCK', 'QUANTITY_OVER_STOCK', 'BELOW_REORDER', 'ORDER_COMMITTED', 'MANUAL'] as const
export type NecesidadOrigen = (typeof NECESIDAD_ORIGENES)[number]

// Solo la carga a mano entra por la API en Fase 1; el resto son automatismos
// (Fase 2) que comparten el mismo registro.
export const ORIGENES_AUTOMATICOS: NecesidadOrigen[] = ['SALE_NO_STOCK', 'RESERVATION_NO_STOCK', 'QUANTITY_OVER_STOCK', 'BELOW_REORDER', 'ORDER_COMMITTED']

export const NECESIDAD_ORIGEN_LABEL: Record<NecesidadOrigen, string> = {
  SALE_NO_STOCK: 'Venta sin stock',
  RESERVATION_NO_STOCK: 'Reserva sin stock',
  QUANTITY_OVER_STOCK: 'Cantidad mayor al stock',
  BELOW_REORDER: 'Bajo punto de reposición',
  ORDER_COMMITTED: 'Pedido comprometido',
  MANUAL: 'Carga manual',
}

export const NECESIDAD_PRIORIDADES = ['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as const
export type NecesidadPrioridad = (typeof NECESIDAD_PRIORIDADES)[number]
const PESO_PRIORIDAD: Record<string, number> = { BAJA: 1, NORMAL: 2, ALTA: 3, URGENTE: 4 }

export const NECESIDAD_ESTADOS = ['ABIERTA', 'ASIGNADA', 'COMPRADA', 'RECIBIDA', 'CANCELADA'] as const
export type NecesidadEstado = (typeof NECESIDAD_ESTADOS)[number]

/** Prioridad más alta de dos (para consolidar). */
export function prioridadMayor(a: string, b: string): NecesidadPrioridad {
  return (PESO_PRIORIDAD[a] || 0) >= (PESO_PRIORIDAD[b] || 0) ? (a as NecesidadPrioridad) : (b as NecesidadPrioridad)
}

export function pesoPrioridad(prioridad: string): number {
  return PESO_PRIORIDAD[prioridad] || 0
}

const fecha = (valor: unknown): string | null => {
  if (valor === null || valor === undefined || valor === '') return null
  const cuando = valor instanceof Date ? valor : new Date(String(valor))
  return Number.isNaN(cuando.getTime()) ? null : cuando.toISOString()
}

/** Fecha más próxima (para consolidar). */
function fechaMasProxima(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b
}

export type NecesidadEntrada = {
  id: string
  productId: string
  producto?: string | null
  condicion?: string | null
  cantidad: number
  prioridad: string
  origen: string
  prometidaEl?: string | Date | null
  sucursalId?: string | null
  sucursal?: string | null
  pedidoId?: string | null
  pedidoNumero?: string | null
  clienteId?: string | null
  cliente?: string | null
}

export type DestinoConsolidado = {
  tipo: 'PEDIDO' | 'STOCK'
  etiqueta: string
  cantidad: number
  sucursalId: string | null
  sucursal: string | null
  pedidoId: string | null
  pedidoNumero: string | null
  clienteId: string | null
  cliente: string | null
  prometidaEl: string | null
}

export type GrupoConsolidado = {
  productoId: string
  producto: string
  condicion: string
  cantidad: number
  prioridad: NecesidadPrioridad
  prometidaEl: string | null
  origenes: string[]
  destinos: DestinoConsolidado[]
  necesidades: string[]
}

/**
 * Consolidación del panel «Por comprar» (#250 §5): agrupa por producto +
 * condición, suma cantidades, deja la prioridad más alta y la fecha prometida
 * más próxima, y conserva los destinos (un pedido, una reserva o reposición de
 * una sucursal) sin mezclarlos nunca entre sí.
 */
export function consolidarNecesidades(necesidades: NecesidadEntrada[] = []): GrupoConsolidado[] {
  const grupos = new Map<string, GrupoConsolidado & { destinosMapa: Map<string, DestinoConsolidado> }>()
  for (const necesidad of necesidades) {
    if (!necesidad || !necesidad.productId) continue
    const condicion = String(necesidad.condicion || 'NEW').toUpperCase()
    const clave = `${necesidad.productId}::${condicion}`
    let grupo = grupos.get(clave)
    if (!grupo) {
      grupo = {
        productoId: necesidad.productId,
        producto: necesidad.producto || '',
        condicion,
        cantidad: 0,
        prioridad: 'NORMAL',
        prometidaEl: null,
        origenes: [],
        destinos: [],
        necesidades: [],
        destinosMapa: new Map(),
      }
      grupos.set(clave, grupo)
    }
    const cantidad = Number(necesidad.cantidad) > 0 ? Math.round(Number(necesidad.cantidad)) : 1
    grupo.cantidad += cantidad
    grupo.prioridad = prioridadMayor(grupo.prioridad, necesidad.prioridad)
    grupo.prometidaEl = fechaMasProxima(grupo.prometidaEl, fecha(necesidad.prometidaEl))
    if (!grupo.origenes.includes(necesidad.origen)) grupo.origenes.push(necesidad.origen)
    grupo.necesidades.push(necesidad.id)
    if (!grupo.producto && necesidad.producto) grupo.producto = necesidad.producto

    // Destino: el pedido (con cliente) o la reposición de una sucursal.
    const claveDestino = necesidad.pedidoId ? `pedido:${necesidad.pedidoId}` : `stock:${necesidad.sucursalId || ''}`
    const destino = grupo.destinosMapa.get(claveDestino)
    if (destino) {
      destino.cantidad += cantidad
      destino.prometidaEl = fechaMasProxima(destino.prometidaEl, fecha(necesidad.prometidaEl))
    } else {
      const esPedido = Boolean(necesidad.pedidoId)
      grupo.destinosMapa.set(claveDestino, {
        tipo: esPedido ? 'PEDIDO' : 'STOCK',
        etiqueta: esPedido
          ? `Pedido ${necesidad.pedidoNumero || 'sin número'}${necesidad.cliente ? ` · ${necesidad.cliente}` : ''}`
          : `Reposición${necesidad.sucursal ? ` · ${necesidad.sucursal}` : ''}`,
        cantidad,
        sucursalId: necesidad.sucursalId || null,
        sucursal: necesidad.sucursal || null,
        pedidoId: necesidad.pedidoId || null,
        pedidoNumero: necesidad.pedidoNumero || null,
        clienteId: necesidad.clienteId || null,
        cliente: necesidad.cliente || null,
        prometidaEl: fecha(necesidad.prometidaEl),
      })
    }
  }
  return [...grupos.values()]
    .map(({ destinosMapa, ...grupo }) => ({ ...grupo, destinos: [...destinosMapa.values()] }))
    .sort((a, b) => pesoPrioridad(b.prioridad) - pesoPrioridad(a.prioridad)
      || new Date(a.prometidaEl || '2999-12-31').getTime() - new Date(b.prometidaEl || '2999-12-31').getTime()
      || b.cantidad - a.cantidad)
}

export type NecesidadManual = {
  productId: string
  branchId: string | null
  quantity: number
  condition: string
  priority: string
  promisedAt: string | null
  notes: string | null
}

/** Normaliza y valida la carga manual de una necesidad (POST de la API). */
export function normalizarNecesidadManual(body: unknown): { ok: true; data: NecesidadManual } | { ok: false; error: string } {
  const fila = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const productId = typeof fila.productId === 'string' && fila.productId.trim() ? fila.productId.trim().slice(0, 128) : ''
  if (!productId) return { ok: false, error: 'Indicá el producto de la necesidad.' }
  const quantity = Number(fila.quantity)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return { ok: false, error: 'La cantidad debe ser un entero entre 1 y 9999.' }
  const condition = typeof fila.condition === 'string' && fila.condition.trim() ? fila.condition.trim().toUpperCase() : 'NEW'
  if (!['NEW', 'USED', 'REFURBISHED'].includes(condition)) return { ok: false, error: 'Condición inválida.' }
  const priority = typeof fila.priority === 'string' && fila.priority.trim() ? fila.priority.trim().toUpperCase() : 'NORMAL'
  if (!(NECESIDAD_PRIORIDADES as readonly string[]).includes(priority)) return { ok: false, error: 'Prioridad inválida.' }
  const promisedAtCrudo = fila.promisedAt
  const promisedAt = fecha(promisedAtCrudo)
  if (promisedAtCrudo !== undefined && promisedAtCrudo !== null && promisedAtCrudo !== '' && !promisedAt) return { ok: false, error: 'La fecha prometida no es válida.' }
  const notes = typeof fila.notes === 'string' && fila.notes.trim() ? fila.notes.trim().slice(0, 500) : null
  const branchId = typeof fila.branchId === 'string' && fila.branchId.trim() ? fila.branchId.trim().slice(0, 128) : null
  return { ok: true, data: { productId, branchId, quantity, condition, priority, promisedAt, notes } }
}
