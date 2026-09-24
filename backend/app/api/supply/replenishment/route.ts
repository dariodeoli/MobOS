import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { reposicionSugerida } from '../../../../lib/supply-forecast'

// #250 Fase 6: reposición sugerida. Cruza stock, punto de pedido (o el stock de
// seguridad de la política), lo que ya viene en camino, lo pedido y el consumo
// diario de los últimos 30 días; con `POST` la sugerencia se convierte en una
// necesidad (BELOW_REORDER) que el panel ya sabe mostrar y consolidar.
const DIAS_CONSUMO = 30

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const branchId = (params.get('branchId') || '').trim()
  const desde = new Date(Date.now() - DIAS_CONSUMO * 86400000)

  const [productos, policies, ventas, enCamino, abiertas] = await Promise.all([
    prisma.product.findMany({ where: { tenantId: tenant, isActive: true, ...(branchId ? { branchId } : {}) }, select: { id: true, name: true, stock: true, reorderPoint: true, branch: { select: { id: true, name: true } } }, take: 2000 }),
    prisma.supplyPolicy.findMany({ where: { tenantId: tenant, ...(branchId ? { branchId } : {}) }, select: { productId: true, branchId: true, safetyStock: true, leadTimeDays: true } }),
    prisma.orderItem.findMany({ where: { order: { tenantId: tenant, createdAt: { gte: desde }, status: 'COMPLETED' } }, select: { productId: true, quantity: true, order: { select: { branchId: true } } } }),
    prisma.supplyShipmentItem.findMany({ where: { tenantId: tenant, shipment: { status: { in: ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA'] } } }, select: { productId: true, shipment: { select: { destinationBranchId: true } } } }),
    prisma.supplyNeed.findMany({ where: { tenantId: tenant, status: { in: ['ABIERTA', 'ASIGNADA'] } }, select: { productId: true, branchId: true, quantity: true } }),
  ])

  const politicaDe = new Map(policies.map((politica) => [`${politica.productId}:${politica.branchId}`, politica]))
  const consumoDe = new Map<string, number>()
  for (const venta of ventas) {
    const clave = `${venta.productId}:${venta.order?.branchId || ''}`
    consumoDe.set(clave, (consumoDe.get(clave) || 0) + Number(venta.quantity || 0))
  }
  const caminoDe = new Map<string, number>()
  for (const item of enCamino) {
    const clave = `${item.productId}:${item.shipment?.destinationBranchId || ''}`
    caminoDe.set(clave, (caminoDe.get(clave) || 0) + 1)
  }
  const abiertasDe = new Map<string, number>()
  for (const necesidad of abiertas) {
    const clave = `${necesidad.productId}:${necesidad.branchId || ''}`
    abiertasDe.set(clave, (abiertasDe.get(clave) || 0) + Number(necesidad.quantity || 0))
  }

  const sugerencias = productos.map((producto) => {
    const sucursalId = producto.branch?.id || ''
    const clave = `${producto.id}:${sucursalId}`
    const politica = politicaDe.get(clave)
    const seguridad = politica?.safetyStock ?? 0
    const plazo = politica?.leadTimeDays ?? 7
    const consumoTotal = consumoDe.get(clave) || 0
    const consumoDiario = consumoTotal / DIAS_CONSUMO
    const calculo = reposicionSugerida({
      stock: producto.stock || 0,
      safetyStock: seguridad,
      leadTimeDays: plazo,
      consumoDiario,
      enCamino: caminoDe.get(clave) || 0,
      abiertas: abiertasDe.get(clave) || 0,
    })
    return {
      productId: producto.id,
      producto: producto.name,
      branchId: sucursalId || null,
      sucursal: producto.branch?.name || null,
      stock: producto.stock || 0,
      reorderPoint: producto.reorderPoint ?? null,
      safetyStock: seguridad,
      leadTimeDays: plazo,
      consumoDiario: Number(consumoDiario.toFixed(2)),
      consumo30d: consumoTotal,
      enCamino: caminoDe.get(clave) || 0,
      abiertas: abiertasDe.get(clave) || 0,
      ...calculo,
    }
  })
  const conFaltante = sugerencias.filter((fila) => fila.sugerida > 0 || fila.urgencia === 'ALTA')
  const lista = params.get('todas') === '1' ? sugerencias : conFaltante
  return json({
    fecha: new Date().toISOString(),
    ventanaDias: DIAS_CONSUMO,
    totales: { productos: lista.length, aReponer: lista.filter((fila) => fila.sugerida > 0).length, urgenciaAlta: lista.filter((fila) => fila.urgencia === 'ALTA').length },
    sugerencias: lista.sort((a, b) => b.sugerida - a.sugerida),
  })
}

export async function POST(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const productId = typeof body?.productId === 'string' ? body.productId.trim() : ''
  if (!productId) return error('Indicá el producto.')
  const producto = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { id: true, branchId: true, name: true } })
  if (!producto) return error('Producto no encontrado.', 404)
  const branchId = typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : producto.branchId
  if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant }, select: { id: true } }))) return error('Sucursal no encontrada.', 404)

  // La reposición sugerida usa la clave de deduplicación: repetirla no duplica.
  const dedupeKey = `BELOW_REORDER:${productId}:${branchId || ''}`
  const existente = await prisma.supplyNeed.findFirst({ where: { tenantId: tenant, dedupeKey, status: { in: ['ABIERTA', 'ASIGNADA'] } } })
  if (existente) return json({ necesidad: existente, repetida: true })

  const cantidadPedida = Number(body?.quantity)
  const quantity = Number.isInteger(cantidadPedida) && cantidadPedida > 0 && cantidadPedida <= 9999
    ? cantidadPedida
    : await (async () => {
      const politica = branchId ? await prisma.supplyPolicy.findFirst({ where: { tenantId: tenant, productId, branchId }, select: { safetyStock: true, leadTimeDays: true } }) : null
      const consumo = await prisma.orderItem.aggregate({ where: { productId, order: { tenantId: tenant, createdAt: { gte: new Date(Date.now() - DIAS_CONSUMO * 86400000) }, status: 'COMPLETED' } }, _sum: { quantity: true } })
      const enCamino = await prisma.supplyShipmentItem.count({ where: { tenantId: tenant, productId, shipment: { status: { in: ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA'] } } } })
      const abiertas = await prisma.supplyNeed.aggregate({ where: { tenantId: tenant, productId, status: { in: ['ABIERTA', 'ASIGNADA'] } }, _sum: { quantity: true } })
      const stock = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant }, select: { stock: true } })
      return Math.max(1, reposicionSugerida({
        stock: stock?.stock || 0,
        safetyStock: politica?.safetyStock ?? 0,
        leadTimeDays: politica?.leadTimeDays ?? 7,
        consumoDiario: (consumo._sum.quantity || 0) / DIAS_CONSUMO,
        enCamino,
        abiertas: abiertas._sum.quantity || 0,
      }).sugerida)
    })()

  const creada = await prisma.$transaction(async (tx) => {
    const necesidad = await tx.supplyNeed.create({
      data: {
        tenantId: tenant,
        branchId,
        productId,
        quantity,
        source: 'BELOW_REORDER',
        priority: 'NORMAL',
        status: 'ABIERTA',
        dedupeKey,
        notes: 'Reposición sugerida por stock de seguridad / punto de pedido',
        createdById: session.user.id,
      },
    })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_NEED_CREATED', entity: 'SupplyNeed', entityId: necesidad.id, metadata: { productId, branchId, quantity, source: 'BELOW_REORDER', sugerida: true } } })
    return necesidad
  }).catch((cause: any) => {
    if (String(cause?.code) === 'P2002') return null
    throw cause
  })
  if (!creada) {
    const otra = await prisma.supplyNeed.findFirst({ where: { tenantId: tenant, dedupeKey } })
    return json({ necesidad: otra, repetida: true })
  }
  return json({ necesidad: creada }, { status: 201 })
}
