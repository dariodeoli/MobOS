import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { resolveUnitPrice, unitPricePygFallback } from '../../../../lib/pricing'
import type { PriceListItemInput } from '../../../../lib/pricing'
import { clasificarCoincidencia, normalizarBusqueda, ordenarResultados, resumirDisponibilidad } from '../../../../lib/product-search'

const ROLES_SUCURSAL_PROPIA = ['VENDEDOR', 'CAJERA']
const LIMITE_MAX = 50
const CAMPOS_PRODUCTO = { id: true, sku: true, name: true, model: true, color: true, capacity: true, condition: true, category: true, pricePyg: true, wholesalePricePyg: true, priceUsd: true, stock: true, branchId: true, imei: true } as const

// Búsqueda de productos para el POS (#157): responde lo que necesita el
// mostrador — nombre, modelo, capacidad, precio, stock por sucursal y
// disponibilidad — y resuelve la identificación por código del escáner
// (IMEI/serial, `MOBOS:<serial>` o SKU). El escaneo muestra el resultado y el
// POS decide si lo agrega; este endpoint no escribe nada.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  const params = new URL(request.url).searchParams
  const consulta = (params.get('q') || '').trim().slice(0, 120)
  if (!consulta) return error('Indicá qué buscar.')
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number(params.get('limit')) || 20))
  const pedida = (params.get('branchId') || '').trim().slice(0, 128) || null
  const branchId = ROLES_SUCURSAL_PROPIA.includes(session.user.role) ? session.user.branchId : pedida || session.user.branchId || null
  const codigo = normalizarBusqueda(consulta)

  const [productos, unidad] = await Promise.all([
    prisma.product.findMany({
      where: {
        tenantId: tenant,
        isActive: true,
        OR: [
          { name: { contains: consulta, mode: 'insensitive' } },
          { sku: { contains: consulta, mode: 'insensitive' } },
          { model: { contains: consulta, mode: 'insensitive' } },
          { capacity: { contains: consulta, mode: 'insensitive' } },
          { color: { contains: consulta, mode: 'insensitive' } },
          { imei: { contains: codigo } },
        ],
      },
      select: CAMPOS_PRODUCTO,
      orderBy: { name: 'asc' },
      take: Math.max(limite * 2, 40),
    }),
    // El serial vive en la unidad: el escáner se identifica por ahí.
    codigo.length >= 4
      ? prisma.inventoryUnit.findFirst({
          where: { tenantId: tenant, serial: codigo },
          select: { id: true, serial: true, status: true, branchId: true, location: { select: { id: true, name: true } }, product: { select: CAMPOS_PRODUCTO } },
        })
      : null,
  ])

  const ids = [...new Set([...productos.map(producto => producto.id), ...(unidad ? [unidad.product.id] : [])])]
  if (!ids.length) return json({ resultados: [], total: 0, branchId, consulta })

  const [conteos, sucursales] = await Promise.all([
    prisma.inventoryUnit.groupBy({ by: ['productId', 'branchId'], where: { tenantId: tenant, productId: { in: ids }, status: { in: ['AVAILABLE', 'RESERVED'] } }, _count: { _all: true } }),
    prisma.branch.findMany({ where: { tenantId: tenant, isActive: true }, select: { id: true, name: true }, take: 200 }),
  ])
  const nombresSucursal = new Map(sucursales.map(sucursal => [sucursal.id, sucursal.name]))
  const unidadesPorProducto = new Map<string, Array<{ branchId: string | null; available: number }>>()
  for (const fila of conteos) {
    const lista = unidadesPorProducto.get(fila.productId) ?? []
    lista.push({ branchId: fila.branchId, available: fila._count._all })
    unidadesPorProducto.set(fila.productId, lista)
  }

  // Precio efectivo opcional: el POS ya conoce al cliente al buscar.
  const customerId = (params.get('customerId') || '').trim().slice(0, 128)
  const quantity = Math.max(1, Number(params.get('quantity')) || 1)
  let cliente: { id: string; pricingTier: string } | null = null
  let lista: { id: string; name: string; items: PriceListItemInput[] } | null = null
  if (customerId) {
    const encontrado = await prisma.customer.findFirst({ where: { id: customerId, tenantId: tenant }, select: { id: true, pricingTier: true, priceListId: true } })
    if (encontrado) {
      cliente = { id: encontrado.id, pricingTier: encontrado.pricingTier }
      if (encontrado.priceListId) {
        const priceList = await prisma.priceList.findFirst({ where: { id: encontrado.priceListId, tenantId: tenant, isActive: true }, include: { items: { include: { tiers: { orderBy: { minQty: 'asc' as const } } } } } })
        if (priceList) lista = { id: priceList.id, name: priceList.name, items: priceList.items }
      }
    }
  }

  const visibles = [...productos, ...(unidad && !productos.some(producto => producto.id === unidad.product.id) ? [unidad.product] : [])]
  const resultados = visibles
    .filter(producto => !ROLES_SUCURSAL_PROPIA.includes(session.user.role) || producto.branchId === null || producto.branchId === session.user.branchId)
    .map(producto => {
      const disponibilidad = resumirDisponibilidad({
        branchId,
        productBranchId: producto.branchId,
        stockContador: producto.stock,
        unidades: unidadesPorProducto.get(producto.id) ?? [],
        nombresSucursal,
      })
      const esUnidadEscaneada = Boolean(unidad && unidad.product.id === producto.id)
      const precio = cliente
        ? (() => {
            const resolucion = resolveUnitPrice({ product: { ...producto, priceUsd: producto.priceUsd === null ? null : Number(producto.priceUsd) }, quantity, customer: cliente, priceList: lista ? { items: lista.items } : null })
            return { efectivo: unitPricePygFallback(resolucion, producto.pricePyg), origen: resolucion.origin }
          })()
        : null
      return {
        ...producto,
        priceUsd: producto.priceUsd === null ? null : Number(producto.priceUsd),
        ...disponibilidad,
        coincidencia: clasificarCoincidencia(producto, consulta, esUnidadEscaneada),
        ...(precio ? { precioEfectivoPyg: precio.efectivo, precioOrigen: precio.origen } : {}),
        ...(esUnidadEscaneada ? { unidad: { id: unidad!.id, serial: unidad!.serial, status: unidad!.status, branchId: unidad!.branchId, location: unidad!.location } } : {}),
      }
    })

  return json({ resultados: ordenarResultados(resultados).slice(0, limite), total: resultados.length, branchId, consulta })
}
