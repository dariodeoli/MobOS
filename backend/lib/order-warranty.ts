import { warrantyDaysFor } from './pricing'

// Garantía por línea del comprobante (#461): los días que se imprimen salen del producto
// (o del default por condición) con la misma regla que registra la cobertura de cada equipo
// al vender (`warrantyDaysFor`). Solo llevan garantía las líneas con IMEI/serial o con
// días propios del producto; un cable o una funda sin dato no inventa garantía.

type ItemLike = { id: string; productId?: string | null; serials?: unknown }
type ProductLike = { condition?: string | null; warrantyDays?: number | null }

export function warrantyDaysOfItem(item: ItemLike, product: ProductLike | null | undefined): number | null {
  if (!item.productId || !product) return null
  const serials = Array.isArray(item.serials) ? item.serials : []
  const own = product.warrantyDays
  if (!serials.length && !(typeof own === 'number' && own > 0)) return null
  const days = warrantyDaysFor({ condition: product.condition, warrantyDays: own })
  return days > 0 ? days : null
}

type ProductReader = {
  product: {
    findMany: (args: { where: { id: { in: string[] } }; select: { id: true; condition: true; warrantyDays: true } }) => Promise<Array<{ id: string; condition: string | null; warrantyDays: number | null }>>
  }
}

/** Agrega `warrantyDays` a cada línea del pedido que lo tenga (una sola consulta de productos). */
export async function withItemWarranty<T extends { items?: unknown }>(db: ProductReader, order: T): Promise<T> {
  const items = (Array.isArray(order.items) ? order.items : []) as Array<ItemLike & Record<string, unknown>>
  const ids = [...new Set(items.map((item) => item.productId).filter((id): id is string => !!id))]
  if (!ids.length) return order
  const products = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, condition: true, warrantyDays: true } })
  const byId = new Map(products.map((product) => [product.id, product]))
  return {
    ...order,
    items: items.map((item) => {
      const days = warrantyDaysOfItem(item, item.productId ? byId.get(item.productId) : null)
      return days ? { ...item, warrantyDays: days } : item
    }),
  }
}
