import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { codigoCompra, normalizarCompra, normalizarSeriales } from '../../../../lib/supply'

// #250 Fase 2 (Centro de Abastecimiento): compra rápida y stock adicional.
//
// - GET   /api/supply/purchases  → compras con sus líneas, IMEI y necesidades.
// - POST  /api/supply/purchases  → registra la compra (proveedor, costo/moneda,
//   referencia/factura, líneas con IMEI ahora o pendientes) y marca como
//   COMPRADAS las necesidades que cubre. No mueve stock.
// - PATCH /api/supply/purchases  → `cancel` (devuelve las necesidades al panel)
//   o `serials` (completa los IMEI que faltaban en una línea).
//
// La foto de la factura se adjunta con la API de adjuntos
// (`entity=SUPPLY_PURCHASE`, `entityId=<id de la compra>`).
const ESTADOS_CERRADOS = ['COMPRADA', 'RECIBIDA', 'CANCELADA']

async function compraConDetalle(id: string, tenant: string) {
  return prisma.supplyPurchase.findFirst({
    where: { id, tenantId: tenant },
    include: {
      supplier: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      lines: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: { select: { id: true, name: true, capacity: true } },
          need: { select: { id: true, source: true, orderId: true, branchId: true } },
          serials: { select: { serial: true } },
        },
      },
      needs: { select: { id: true, status: true } },
    },
  })
}

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const status = (params.get('status') || '').trim().toUpperCase()
  const supplierId = (params.get('supplierId') || '').trim()
  const branchId = (params.get('branchId') || '').trim()
  const limite = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))

  const compras = await prisma.supplyPurchase.findMany({
    where: {
      tenantId: tenant,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(branchId ? { branchId } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limite,
    select: {
      id: true, code: true, status: true, supplierId: true, supplierName: true, currency: true,
      originalCost: true, exchangeRatePyg: true, costPyg: true, reference: true, notes: true,
      branchId: true, createdAt: true,
      branch: { select: { name: true } },
      lines: { select: { id: true, productId: true, condition: true, quantity: true, unitCostPyg: true, needId: true, serials: { select: { serial: true } } } },
    },
  })
  return json({
    fecha: new Date().toISOString(),
    totales: { compras: compras.length, unidades: compras.reduce((suma, compra) => suma + compra.lines.reduce((total, linea) => total + linea.quantity, 0), 0) },
    compras: compras.map((compra) => ({
      ...compra,
      originalCost: compra.originalCost === null ? null : Number(compra.originalCost),
      exchangeRatePyg: compra.exchangeRatePyg === null ? null : Number(compra.exchangeRatePyg),
      unidades: compra.lines.reduce((total, linea) => total + linea.quantity, 0),
    })),
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
  const normalizada = normalizarCompra(body)
  if (!normalizada.ok) return error(normalizada.error)
  const compra = normalizada.data

  // Proveedor: ficha de la empresa o nombre libre (se conserva el snapshot).
  let supplierName = compra.supplierName
  if (compra.supplierId) {
    const proveedor = await prisma.supplier.findFirst({ where: { id: compra.supplierId, tenantId: tenant }, select: { id: true, name: true } })
    if (!proveedor) return error('Proveedor no encontrado.', 404)
    supplierName = compra.supplierName || proveedor.name
  }
  if (compra.branchId) {
    const sucursal = await prisma.branch.findFirst({ where: { id: compra.branchId, tenantId: tenant }, select: { id: true } })
    if (!sucursal) return error('Sucursal no encontrada.', 404)
  }

  // Productos y necesidades de las líneas.
  const productIds = [...new Set(compra.lines.map((linea) => linea.productId))]
  const productos = await prisma.product.findMany({ where: { id: { in: productIds }, tenantId: tenant }, select: { id: true } })
  const productosValidos = new Set(productos.map((producto) => producto.id))
  if (productosValidos.size !== productIds.length) return error('Alguna línea apunta a un producto inexistente.', 404)

  const needIds = [...new Set(compra.lines.map((linea) => linea.needId).filter(Boolean))] as string[]
  const necesidades = needIds.length ? await prisma.supplyNeed.findMany({ where: { id: { in: needIds }, tenantId: tenant }, select: { id: true, productId: true, condition: true, status: true } }) : []
  if (necesidades.length !== needIds.length) return error('Alguna necesidad no existe.', 404)
  const necesidadPorId = new Map(necesidades.map((necesidad) => [necesidad.id, necesidad]))
  for (const linea of compra.lines) {
    if (!linea.needId) continue
    const necesidad = necesidadPorId.get(linea.needId)!
    if (necesidad.productId !== linea.productId) return error('La línea no coincide con el producto de la necesidad que cubre.')
    if (necesidad.condition !== linea.condition) return error('La línea no coincide con la condición de la necesidad que cubre.')
    if (ESTADOS_CERRADOS.includes(necesidad.status)) return error('Hay una necesidad que ya está cubierta o cancelada.', 409)
  }

  // IMEI/seriales: sin duplicados dentro de la compra ni contra lo ya cargado.
  const seriales = compra.lines.flatMap((linea) => linea.serials)
  if (seriales.length) {
    const duplicado = await prisma.supplyPurchaseSerial.findFirst({ where: { tenantId: tenant, serial: { in: seriales } }, select: { serial: true } })
    if (duplicado) return error(`El IMEI ${duplicado.serial} ya está cargado en otra compra.`, 409)
    const enStock = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: { in: seriales } }, select: { serial: true } })
    if (enStock) return error(`El IMEI ${enStock.serial} ya está en el inventario.`, 409)
  }

  // Código compartido (#250 §2): manual o correlativo de la empresa.
  let code = compra.code
  if (!code) {
    const total = await prisma.supplyPurchase.count({ where: { tenantId: tenant } })
    code = codigoCompra({ origen: typeof body?.origin === 'string' && body.origin.trim() ? body.origin.trim() : 'CDE', destino: typeof body?.destination === 'string' ? body.destination : '', secuencia: total + 1 })
  }
  const existente = await prisma.supplyPurchase.findFirst({ where: { tenantId: tenant, code }, select: { id: true } })
  if (existente) return error(`El código ${code} ya existe.`, 409)

  const creada = await prisma.$transaction(async (tx) => {
    const cabecera = await tx.supplyPurchase.create({
      data: {
        tenantId: tenant,
        code,
        branchId: compra.branchId,
        supplierId: compra.supplierId,
        supplierName,
        currency: compra.currency as never,
        originalCost: compra.originalCost,
        exchangeRatePyg: compra.exchangeRatePyg,
        costPyg: compra.costPyg,
        reference: compra.reference,
        notes: compra.notes,
        status: 'COMPRADA',
        createdById: session.user.id,
      },
    })
    for (const linea of compra.lines) {
      const fila = await tx.supplyPurchaseLine.create({
        data: {
          tenantId: tenant,
          purchaseId: cabecera.id,
          needId: linea.needId,
          productId: linea.productId,
          condition: linea.condition as never,
          quantity: linea.quantity,
          unitCostPyg: linea.unitCostPyg,
        },
      })
      if (linea.serials.length) {
        await tx.supplyPurchaseSerial.createMany({ data: linea.serials.map((serial) => ({ tenantId: tenant, lineId: fila.id, serial })) })
      }
    }
    if (needIds.length) {
      await tx.supplyNeed.updateMany({ where: { id: { in: needIds }, tenantId: tenant }, data: { status: 'COMPRADA', purchaseId: cabecera.id } })
    }
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'SUPPLY_PURCHASE_CREATED',
        entity: 'SupplyPurchase',
        entityId: cabecera.id,
        metadata: {
          code,
          supplierName,
          currency: compra.currency,
          costPyg: compra.costPyg,
          unidades: compra.lines.reduce((suma, linea) => suma + linea.quantity, 0),
          lineas: compra.lines.length,
          necesidades: needIds.length,
          seriales: seriales.length,
        },
      },
    })
    return cabecera
  }).catch((cause: any) => {
    if (String(cause?.code) === 'P2002') return null
    throw cause
  })
  if (!creada) return error('El código de la compra ya existe (reintentá).', 409)

  return json(await compraConDetalle(creada.id, tenant), { status: 201 })
}

export async function PATCH(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  let body: any
  try { body = await request.json() } catch { return error('JSON inválido.') }
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!id) return error('Indicá la compra.')
  const compra = await prisma.supplyPurchase.findFirst({ where: { id, tenantId: tenant } })
  if (!compra) return error('Compra no encontrada.', 404)

  if (body?.action === 'cancel') {
    if (compra.status === 'CANCELADA') return error('La compra ya está cancelada.', 409)
    const motivo = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (motivo.length < 3) return error('Indicá el motivo de la cancelación (mínimo 3 caracteres).')
    const actualizada = await prisma.$transaction(async (tx) => {
      const fila = await tx.supplyPurchase.update({ where: { id: compra.id }, data: { status: 'CANCELADA', notes: motivo.slice(0, 500) } })
      // Las necesidades vuelven al panel: la compra no se completó.
      await tx.supplyNeed.updateMany({ where: { tenantId: tenant, purchaseId: compra.id }, data: { status: 'ABIERTA', purchaseId: null } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_PURCHASE_CANCELLED', entity: 'SupplyPurchase', entityId: fila.id, metadata: { code: fila.code, reason: motivo.slice(0, 500) } } })
      return fila
    })
    return json(await compraConDetalle(actualizada.id, tenant))
  }

  if (body?.action === 'serials') {
    const lineId = typeof body?.lineId === 'string' ? body.lineId.trim() : ''
    if (!lineId) return error('Indicá la línea.')
    const linea = await prisma.supplyPurchaseLine.findFirst({ where: { id: lineId, purchaseId: compra.id, tenantId: tenant }, include: { serials: { select: { serial: true } } } })
    if (!linea) return error('Línea no encontrada.', 404)
    const seriales = normalizarSeriales(body?.serials)
    if (!seriales.ok) return error(seriales.error)
    if (!seriales.seriales.length) return error('Indicá al menos un IMEI/serial.')
    if (linea.serials.length + seriales.seriales.length > linea.quantity) return error(`La línea admite ${linea.quantity} IMEI/serial (ya tiene ${linea.serials.length}).`)
    const yaEnLinea = new Set(linea.serials.map((fila) => fila.serial))
    if (seriales.seriales.some((serial) => yaEnLinea.has(serial))) return error('Hay un IMEI repetido en la línea.')
    const duplicado = await prisma.supplyPurchaseSerial.findFirst({ where: { tenantId: tenant, serial: { in: seriales.seriales } }, select: { serial: true } })
    if (duplicado) return error(`El IMEI ${duplicado.serial} ya está cargado en otra compra.`, 409)
    const enStock = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: { in: seriales.seriales } }, select: { serial: true } })
    if (enStock) return error(`El IMEI ${enStock.serial} ya está en el inventario.`, 409)
    await prisma.$transaction(async (tx) => {
      await tx.supplyPurchaseSerial.createMany({ data: seriales.seriales.map((serial) => ({ tenantId: tenant, lineId: linea.id, serial })) })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_PURCHASE_SERIALS_ADDED', entity: 'SupplyPurchase', entityId: compra.id, metadata: { code: compra.code, lineId: linea.id, seriales: seriales.seriales.length } } })
    })
    return json(await compraConDetalle(compra.id, tenant))
  }

  return error('Acción inválida: usá cancel o serials.')
}
