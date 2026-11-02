// Venta sin stock → aviso a quien compra. Cuando una venta (o pedido) deja
// necesidades de compra, quien gestiona el abastecimiento recibe un push al
// celular/navegador y la novedad en la campana, sin tener que ir a mirar.
import { prisma } from './prisma'
import { effectivePermissions } from './auth'
import { enviarWebPush } from './web-push'
import { logError } from './log'

// Necesidades que nacen de una venta o reserva concreta (no las de reposición
// por mínimos, que no tienen cliente esperando).
export const ORIGENES_VENTA_SIN_STOCK = ['SALE_NO_STOCK', 'ORDER_COMMITTED', 'QUANTITY_OVER_STOCK', 'RESERVATION_NO_STOCK'] as const

export const URL_VENTAS_SIN_STOCK = '/abastecimiento?tab=ventas'

// Quienes abren el abastecimiento en la app: el dueño y el rol Compras. El
// gerente tiene stock:manage pero no ve esas pantallas, así que no se le avisa.
export const ROLES_COMPRADORES = ['ADMIN', 'COMPRAS'] as const

type Candidato = { id: string; role: string; branchId: string | null; permissions: unknown }

/** Puede comprar (rol comprador con stock:manage) y ve la sucursal de la venta. */
export function esCompradorDeLaVenta(usuario: Candidato, branchId: string | null) {
  if (!(ROLES_COMPRADORES as readonly string[]).includes(usuario.role)) return false
  const permisos = effectivePermissions(usuario.role, usuario.permissions)
  if (!permisos.includes('*') && !permisos.includes('stock:manage')) return false
  if (usuario.role === 'ADMIN' || !usuario.branchId || !branchId) return true
  return usuario.branchId === branchId
}

/** «dd/mm» en hora de Asunción (UTC-3 fijo), sin depender de los datos ICU. */
export function diaMesAsuncion(fecha: Date) {
  const local = new Date(fecha.getTime() - 3 * 3_600_000)
  return `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Texto del push: producto y fecha, nunca el cliente ni montos. */
export function textoAvisoVentaSinStock(lineas: Array<{ producto: string; cantidad: number }>, prometida: Date | null) {
  const primera = lineas[0]
  const producto = primera ? `${primera.cantidad > 1 ? `${primera.cantidad} × ` : ''}${primera.producto}` : 'un producto'
  const otros = lineas.length > 1 ? ` y ${lineas.length - 1} más` : ''
  const fecha = prometida ? ` · prometido para el ${diaMesAsuncion(prometida)}` : ''
  return `Hay que comprar ${producto}${otros}${fecha}.`
}

/** Avisa a los compradores de las necesidades recién creadas. Nunca lanza. */
export async function notifyVentaSinStock(input: { tenantId: string; orderId: string; branchId: string | null; needIds: string[]; excluirUserId?: string | null }) {
  if (!input.needIds.length) return
  try {
    const necesidades = await prisma.supplyNeed.findMany({
      where: { tenantId: input.tenantId, id: { in: input.needIds }, source: { in: [...ORIGENES_VENTA_SIN_STOCK] } },
      select: { quantity: true, promisedAt: true, product: { select: { name: true } } },
    })
    if (!necesidades.length) return
    const usuarios = await prisma.user.findMany({
      where: { tenantId: input.tenantId, status: 'ACTIVE', role: { in: [...ROLES_COMPRADORES] } },
      select: { id: true, role: true, branchId: true, permissions: true },
    })
    const destinatarios = usuarios.filter((usuario) => usuario.id !== input.excluirUserId && esCompradorDeLaVenta(usuario, input.branchId))
    if (!destinatarios.length) return
    const prometidas = necesidades.map((fila) => fila.promisedAt).filter((fecha): fecha is Date => Boolean(fecha))
    const prometida = prometidas.length ? new Date(Math.min(...prometidas.map((fecha) => fecha.getTime()))) : null
    const cuerpo = textoAvisoVentaSinStock(necesidades.map((fila) => ({ producto: fila.product?.name || 'Producto', cantidad: fila.quantity })), prometida)
    for (const destinatario of destinatarios) {
      await enviarWebPush({ tenantId: input.tenantId, userId: destinatario.id, titulo: 'Venta sin stock', cuerpo, url: URL_VENTAS_SIN_STOCK, tag: `venta-sin-stock-${input.orderId}`, urgente: Boolean(prometida) })
    }
  } catch (cause) {
    logError('abastecimiento: no se pudo avisar la venta sin stock', { orderId: input.orderId, error: cause instanceof Error ? cause.message : String(cause) })
  }
}
