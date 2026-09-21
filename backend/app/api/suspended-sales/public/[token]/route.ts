import { createHash } from 'node:crypto'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'

// Vista pública del borrador de carrito (#154): sin autenticación, con el token
// de 64 hex del enlace. Muestra lo que el cliente necesita para confirmar
// (productos, precios, descuentos, subtotal, total y condiciones) y nunca datos
// internos: ni teléfono/documento del cliente, ni notas internas, ni costos.
const money = (value: number) => Math.max(0, Math.round(value))

const descuentoDeLinea = (item: Record<string, unknown>) => {
  const precio = Number(item.precio) || 0
  const cantidad = Math.max(1, Number(item.quantity) || 1)
  const pct = Number(String(item.descuentoPct ?? '').replace('%', '')) || 0
  if (pct > 0) return Math.round((precio * cantidad * pct) / 100)
  const fijo = Number(String(item.descuento ?? '').replace(/\D/g, '')) || 0
  return Math.min(fijo, precio * cantidad)
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  // El token es aleatorio de 64 hex: cualquier otra cosa no puede existir.
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return error('Carrito no encontrado.', 404)
  const publicTokenHash = createHash('sha256').update(token).digest('hex')
  const row = await prisma.suspendedSale.findFirst({
    where: { publicTokenHash },
    include: {
      tenant: { select: { name: true, phone: true, city: true, address: true } },
      branch: { select: { name: true, city: true, phone: true } },
      customer: { select: { name: true } },
    },
  })
  if (!row) return error('Carrito no encontrado.', 404)

  const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>
  const crudos = Array.isArray(payload.items) ? (payload.items as Record<string, unknown>[]) : []
  const productoIds = crudos.map((item) => String(item.productoId || '')).filter(Boolean)
  const productos = productoIds.length
    ? await prisma.product.findMany({ where: { tenantId: row.tenantId, id: { in: productoIds } }, select: { id: true, stock: true } })
    : []
  const stockPorProducto = new Map(productos.map((producto) => [producto.id, Number(producto.stock) || 0]))

  const items = crudos.map((item) => {
    const cantidad = Math.max(1, Number(item.quantity) || 1)
    const precio = Number(item.precio) || 0
    const descuento = descuentoDeLinea(item)
    const stock = stockPorProducto.get(String(item.productoId || ''))
    return {
      description: String(item.nombre || 'Producto'),
      quantity: cantidad,
      unitPricePyg: precio,
      discountPyg: descuento,
      totalPyg: money(precio * cantidad - descuento),
      // Aviso de disponibilidad: el precio y el stock se confirman al cerrar.
      available: stock === undefined ? true : stock >= cantidad,
    }
  })
  const subtotalPyg = items.reduce((suma, item) => suma + item.totalPyg, 0)
  const discountPyg = money(Number(String(payload.descuento ?? '').replace(/\D/g, '')) || 0)
  const deliveryPyg = money(Number(String(payload.montoDelivery ?? '').replace(/\D/g, '')) || 0)
  const totalPyg = money(subtotalPyg - discountPyg + deliveryPyg)
  const empresa = row.tenant?.name || 'la tienda'
  const telefonoTienda = String(row.tenant?.phone || row.branch?.phone || '').replace(/\D/g, '')
  const checkoutUrl = telefonoTienda
    ? `https://wa.me/${telefonoTienda}?text=${encodeURIComponent(`Hola ${empresa}, quiero confirmar el carrito${row.label ? ` "${row.label}"` : ''} por ${new Intl.NumberFormat('es-PY').format(totalPyg)} Gs.`)}`
    : null

  return json({
    company: { name: empresa, city: row.tenant?.city || row.branch?.city || null },
    branch: row.branch?.name || null,
    // Solo el nombre: es la referencia que el cliente reconoce.
    customerName: row.customer?.name || null,
    label: row.label || null,
    items,
    subtotalPyg,
    discountPyg,
    deliveryPyg,
    totalPyg,
    deliveryType: typeof payload.entrega === 'string' ? payload.entrega : null,
    notes: typeof payload.observacion === 'string' && payload.observacion.trim() ? payload.observacion.trim() : null,
    conditions: 'Precios y disponibilidad sujetos a confirmación al cerrar la compra.',
    issuedAt: row.publicTokenIssuedAt,
    checkoutUrl,
  })
}
