// #280 · Aviso de INV al vendedor (cross-dominio INV→POS).
//
// Cuando cambia el stock o la disponibilidad de un **producto comprometido**
// (una necesidad de abastecimiento nacida de una venta sin stock o de un
// pedido en firme), el vendedor recibe la novedad en la bandeja interna del
// panel. El aviso se deriva de lo que ya existe —necesidades, unidades y la
// **auditoría** del inventario (ese es el registro)—, sin tabla nueva:
//
//   · un aviso por **pedido + producto** (se queda el último cambio);
//   · solo si el cambio es **posterior al compromiso** y cae en la ventana;
//   · solo si el cambio **invierte** la disponibilidad: llegó lo que faltaba
//     (hay unidades) o se dio de baja lo último disponible (no hay nada);
//   · el cambio del propio vendedor no le vuelve como aviso (sin spam).
//
// Fuentes de evento: recepción de unidades (alta, directa o de un lote F5),
// restauración, ajuste de estado, baja, venta de unidades y edición del stock
// de un producto sin seriales. Devoluciones y traspasos quedan afuera por ahora
// (no tienen un evento por producto/unidad).
import type { Prisma } from '@prisma/client'

export type TipoEventoDisponibilidad = 'ALTA' | 'BAJA'

export type EventoDisponibilidad = {
  productId: string
  branchId: string | null
  tipo: TipoEventoDisponibilidad
  at: Date
  userId?: string | null
}

export type CompromisoStock = {
  /** Necesidad de abastecimiento (el compromiso). */
  id: string
  orderId: string | null
  orderNumber: string | null
  customerName: string | null
  productId: string
  productName: string
  branchId: string | null
  branchName?: string | null
  quantity?: number
  createdAt: Date
}

export type DisponibilidadStock = { unidades: number; stock: number }

export type AvisoStock = {
  id: string
  kind: 'STOCK' | 'SIN_STOCK'
  title: string
  detail: string
  at: Date
  href: string
}

export const DIAS_VENTANA_STOCK = 7
export const MAX_AVISOS_STOCK = 10

/** Clave de disponibilidad: producto + sucursal (la sucursal puede faltar). */
export const claveDisponibilidad = (productId: unknown, branchId: unknown) => `${String(productId || '')}|${String(branchId || '')}`

export const ACCIONES_UNIDAD = ['INVENTORY_UNIT_RECEIVED', 'INVENTORY_UNIT_RESTORED', 'INVENTORY_UNIT_ADJUSTED', 'INVENTORY_UNIT_REMOVED'] as const
export const ACCIONES_PRODUCTO = ['PRODUCT_CREATED', 'PRODUCT_UPDATED'] as const
export const ACCIONES_AUDITORIA_STOCK = [...ACCIONES_UNIDAD, ...ACCIONES_PRODUCTO, 'INVENTORY_UNITS_SOLD'] as const

type RegistroAuditoria = Pick<Prisma.AuditLogGetPayload<object>, 'action' | 'entity' | 'entityId' | 'metadata' | 'createdAt' | 'userId'>

type UnidadLite = { id?: string; serial?: string; productId: string; branchId: string | null }
type ProductoLite = { id: string; branchId: string | null }

const metadataDe = (registro: RegistroAuditoria): Record<string, unknown> => (registro.metadata && typeof registro.metadata === 'object' ? registro.metadata as Record<string, unknown> : {})

/**
 * Traduce la auditoría del inventario a eventos de disponibilidad. Las altas de
 * unidades traen el producto en la metadata; el resto se resuelve con las
 * unidades (por id o por serial) y con el catálogo (stock sin seriales).
 */
export function eventosDeAuditoria(registros: RegistroAuditoria[], { unidadesPorId = new Map(), unidadesPorSerial = new Map(), productosPorId = new Map() }: {
  unidadesPorId?: Map<string, UnidadLite>
  unidadesPorSerial?: Map<string, UnidadLite>
  productosPorId?: Map<string, ProductoLite>
} = {}): EventoDisponibilidad[] {
  const eventos: EventoDisponibilidad[] = []
  for (const registro of registros) {
    const accion = String(registro.action || '')
    const metadata = metadataDe(registro)
    const at = registro.createdAt
    const userId = registro.userId ?? null

    if ((ACCIONES_UNIDAD as readonly string[]).includes(accion)) {
      const unidad = unidadesPorId.get(String(registro.entityId || ''))
      const productId = String(metadata.productId || unidad?.productId || '')
      if (!productId) continue
      const branchId = (metadata.branchId as string) || unidad?.branchId || null
      const tipo: TipoEventoDisponibilidad = accion === 'INVENTORY_UNIT_RECEIVED' || accion === 'INVENTORY_UNIT_RESTORED'
        ? 'ALTA'
        : accion === 'INVENTORY_UNIT_REMOVED'
          ? 'BAJA'
          : String((metadata.after as { status?: string } | undefined)?.status || '') === 'AVAILABLE' ? 'ALTA' : 'BAJA'
      eventos.push({ productId, branchId, tipo, at, userId })
      continue
    }

    // Venta de unidades: cada serial vendido deja de estar disponible.
    if (accion === 'INVENTORY_UNITS_SOLD') {
      const seriales = Array.isArray(metadata.serials) ? metadata.serials : []
      for (const serial of seriales) {
        const unidad = unidadesPorSerial.get(String(serial))
        if (!unidad?.productId) continue
        eventos.push({ productId: unidad.productId, branchId: unidad.branchId || null, tipo: 'BAJA', at, userId })
      }
      continue
    }

    // Productos sin seriales: la edición del stock es la señal (con `stockBefore`).
    if ((ACCIONES_PRODUCTO as readonly string[]).includes(accion)) {
      const producto = productosPorId.get(String(registro.entityId || ''))
      const productId = String(metadata.productId || registro.entityId || '')
      if (!productId || !producto) continue
      const stock = Number(metadata.stock ?? 0)
      const antes = Number(metadata.stockBefore ?? (accion === 'PRODUCT_CREATED' ? 0 : stock))
      if (!Number.isFinite(stock) || !Number.isFinite(antes) || stock === antes) continue
      eventos.push({ productId, branchId: producto.branchId || null, tipo: stock > antes ? 'ALTA' : 'BAJA', at, userId })
    }
  }
  return eventos
}

/**
 * Avisos para el vendedor a partir de sus compromisos. `disponibilidad` va por
 * `claveDisponibilidad(producto, sucursal)` y los eventos se dedupean por esa
 * misma clave (solo importa el último cambio).
 */
export function avisosDeStock(
  compromisos: CompromisoStock[] = [],
  eventos: EventoDisponibilidad[] = [],
  disponibilidad: Map<string, DisponibilidadStock> = new Map(),
  { ahora = new Date(), ventanaDias = DIAS_VENTANA_STOCK, ignorarUsuarioId = null, maximo = MAX_AVISOS_STOCK }: { ahora?: Date; ventanaDias?: number; ignorarUsuarioId?: string | null; maximo?: number } = {},
): AvisoStock[] {
  const limite = new Date(ahora.getTime() - ventanaDias * 86400000)
  const ultimoPorClave = new Map<string, EventoDisponibilidad>()
  for (const evento of eventos) {
    if (!(evento.at instanceof Date) || Number.isNaN(evento.at.getTime()) || evento.at < limite) continue
    const clave = claveDisponibilidad(evento.productId, evento.branchId)
    const previo = ultimoPorClave.get(clave)
    if (!previo || evento.at > previo.at) ultimoPorClave.set(clave, evento)
  }

  const avisos = new Map<string, AvisoStock>()
  for (const compromiso of compromisos) {
    if (!compromiso.orderId) continue
    const clave = claveDisponibilidad(compromiso.productId, compromiso.branchId)
    const evento = ultimoPorClave.get(clave)
    if (!evento) continue
    // El cambio tiene que ser posterior al compromiso: si no, no cambió nada
    // para esa venta (y no se inventa un aviso).
    if (evento.at <= compromiso.createdAt) continue
    if (ignorarUsuarioId && evento.userId === ignorarUsuarioId) continue
    const disp = disponibilidad.get(clave) || { unidades: 0, stock: 0 }
    const hayStock = Number(disp.unidades || 0) + Number(disp.stock || 0) > 0
    const alta = evento.tipo === 'ALTA'
    if (alta !== hayStock) continue

    const id = `stock-${compromiso.orderId}-${compromiso.productId}`
    const contexto = [compromiso.productName, compromiso.orderNumber, compromiso.customerName].filter(Boolean).join(' · ')
    const aviso: AvisoStock = {
      id,
      kind: alta ? 'STOCK' : 'SIN_STOCK',
      title: alta ? 'Ya hay stock para tu pedido' : 'Tu pedido quedó sin stock',
      detail: alta
        ? `${contexto} · ${disp.unidades + disp.stock} disponible(s)`
        : `${contexto} · se dio de baja lo último disponible`,
      at: evento.at,
      href: `/pedidos/${compromiso.orderId}`,
    }
    const previo = avisos.get(id)
    if (!previo || aviso.at > previo.at) avisos.set(id, aviso)
  }
  return [...avisos.values()].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, Math.max(0, maximo))
}
