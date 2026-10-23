import { productImageUrls } from './product-images'

// Miniatura por línea del pedido (detalle estilo Shopify): la imagen principal
// activa del producto. Una sola consulta por pedido; sin foto, la línea queda igual.
type ThumbReader = {
  productImage: {
    findMany: (args: {
      where: { tenantId: string; productId: { in: string[] }; deletedAt: null }
      orderBy: Array<{ isPrimary?: 'desc'; position?: 'asc'; createdAt?: 'asc' }>
      select: { id: true; productId: true }
    }) => Promise<Array<{ id: string; productId: string }>>
  }
}

export async function withItemThumbs<T extends { items?: unknown }>(db: ThumbReader, tenantId: string, order: T): Promise<T> {
  const items = (Array.isArray(order.items) ? order.items : []) as Array<{ productId?: string | null } & Record<string, unknown>>
  const ids = [...new Set(items.map((item) => item.productId).filter((id): id is string => !!id))]
  if (!ids.length) return order
  const images = await db.productImage.findMany({
    where: { tenantId, productId: { in: ids }, deletedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, productId: true },
  })
  const firstByProduct = new Map<string, string>()
  for (const image of images) if (!firstByProduct.has(image.productId)) firstByProduct.set(image.productId, image.id)
  return {
    ...order,
    items: items.map((item) => {
      const imageId = item.productId ? firstByProduct.get(item.productId) : undefined
      return imageId && item.productId ? { ...item, thumbUrl: productImageUrls(item.productId, imageId).thumbUrl } : item
    }),
  }
}
