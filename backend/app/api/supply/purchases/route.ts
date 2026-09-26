import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { codigoCompra, compararModelo, cuadrarSeriales, normalizarCompra, resumenPreparacion } from '../../../../lib/supply'

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
  const compra = await prisma.supplyPurchase.findFirst({
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
  if (!compra) return compra
  // Los Decimal viajan como número (igual que el GET de la lista).
  return {
    ...compra,
    originalCost: compra.originalCost === null ? null : Number(compra.originalCost),
    exchangeRatePyg: compra.exchangeRatePyg === null ? null : Number(compra.exchangeRatePyg),
    lines: compra.lines.map((linea) => ({
      ...linea,
      originalUnitCost: linea.originalUnitCost === null ? null : Number(linea.originalUnitCost),
    })),
  }
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
      lines: { select: { id: true, productId: true, condition: true, quantity: true, unitCostPyg: true, originalUnitCost: true, needId: true, serials: { select: { serial: true } } } },
    },
  })
  const conPreparacion = compras.map((compra) => ({
    ...compra,
    originalCost: compra.originalCost === null ? null : Number(compra.originalCost),
    exchangeRatePyg: compra.exchangeRatePyg === null ? null : Number(compra.exchangeRatePyg),
    unidades: compra.lines.reduce((total, linea) => total + linea.quantity, 0),
    lines: compra.lines.map((linea) => ({
      ...linea,
      originalUnitCost: linea.originalUnitCost === null ? null : Number(linea.originalUnitCost),
      faltan: Math.max(0, linea.quantity - linea.serials.length),
    })),
  }))
  // `?pendientes=1` deja solo las compras con IMEI por completar (preparación).
  const filtradas = params.get('pendientes') === '1'
    ? conPreparacion.filter((compra) => compra.lines.some((linea) => linea.faltan > 0))
    : conPreparacion
  return json({
    fecha: new Date().toISOString(),
    totales: {
      compras: filtradas.length,
      unidades: filtradas.reduce((suma, compra) => suma + compra.unidades, 0),
      pendientes: filtradas.reduce((suma, compra) => suma + resumenPreparacion(compra.lines.map((linea) => ({ quantity: linea.quantity, serials: linea.serials.map((fila) => fila.serial) }))).pendientes, 0),
    },
    compras: filtradas,
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
          originalUnitCost: linea.originalUnitCost,
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

  // IMEI: carga múltiple (pegado) o escaneo de a uno (mobile). Ambos comparten
  // el cuadre: Luhn, repetidos en el lote, duplicados globales y cantidad vs
  // comprada. Si la línea queda incompleta, el IMEI queda diferido (#250 §7).
  if (body?.action === 'serials' || body?.action === 'scan') {
    const escaneo = body?.action === 'scan'
    const lineIdPedido = typeof body?.lineId === 'string' ? body.lineId.trim() : ''
    const productIdPedido = typeof body?.productId === 'string' ? body.productId.trim() : ''
    let linea = lineIdPedido
      ? await prisma.supplyPurchaseLine.findFirst({ where: { id: lineIdPedido, purchaseId: compra.id, tenantId: tenant }, include: { serials: { select: { serial: true } } } })
      : null
    if (!linea && productIdPedido) {
      const candidatas = await prisma.supplyPurchaseLine.findMany({ where: { purchaseId: compra.id, tenantId: tenant, productId: productIdPedido }, include: { serials: { select: { serial: true } } }, orderBy: { createdAt: 'asc' } })
      linea = candidatas.find((fila) => fila.serials.length < fila.quantity) || candidatas[0] || null
    }
    if (!linea) {
      if (!lineIdPedido && !productIdPedido) return error('Indicá la línea o el producto del IMEI.')
      return error('Línea no encontrada.', 404)
    }

    const seriales = cuadrarSeriales({ seriales: escaneo ? [body?.serial] : body?.serials, cantidad: linea.quantity, yaEnLinea: linea.serials.map((fila) => fila.serial) })
    if (!seriales.ok) return error(seriales.error)
    const duplicado = await prisma.supplyPurchaseSerial.findFirst({ where: { tenantId: tenant, serial: { in: seriales.nuevos } }, select: { serial: true } })
    if (duplicado) return error(`El IMEI ${duplicado.serial} ya está cargado en otra compra.`, 409)
    const enStock = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: { in: seriales.nuevos } }, select: { serial: true } })
    if (enStock) return error(`El IMEI ${enStock.serial} ya está en el inventario.`, 409)

    // Aviso (no bloquea): el modelo del panel no coincide con el producto esperado.
    let aviso: string | null = null
    if (escaneo) {
      const consulta = await prisma.imeiCheckQuery.findFirst({ where: { tenantId: tenant, imei: seriales.nuevos[0] }, orderBy: { requestedAt: 'desc' }, select: { normalized: true } })
      const detectado = Array.isArray(consulta?.normalized) ? (consulta.normalized as any[]).find((campo) => campo?.clave === 'modelo')?.valor : null
      const producto = await prisma.product.findFirst({ where: { id: linea.productId, tenantId: tenant }, select: { name: true, model: true } })
      const comparacion = compararModelo(producto?.model || producto?.name, detectado)
      if (comparacion && !comparacion.coincide) aviso = `El IMEI figura como ${comparacion.detectado} y la línea espera ${producto?.model || producto?.name}.`
    }

    await prisma.$transaction(async (tx) => {
      await tx.supplyPurchaseSerial.createMany({ data: seriales.nuevos.map((serial) => ({ tenantId: tenant, lineId: linea!.id, serial })) })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_PURCHASE_SERIALS_ADDED', entity: 'SupplyPurchase', entityId: compra.id, metadata: { code: compra.code, lineId: linea!.id, seriales: seriales.nuevos.length, via: escaneo ? 'scan' : 'bulk' } } })
    })
    const detalle = await compraConDetalle(compra.id, tenant)
    return json(escaneo ? { ...detalle, linea: linea.id, agregados: seriales.nuevos.length, aviso } : detalle)
  }

  return error('Acción inválida: usá cancel, serials o scan.')
}
