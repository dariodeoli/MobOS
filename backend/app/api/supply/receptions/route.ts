import { PaymentCurrency } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { changeStock } from '../../../../lib/stock'
import { costoPorUnidad, estadoLoteRecepcion, normalizarSeriales, RESULTADOS_INCIDENCIA, RESULTADOS_RECEPCION, resumenRecepcion } from '../../../../lib/supply'

// #250 Fase 5 (Centro de Abastecimiento): recepción del envío entrante.
//
// - GET   /api/supply/receptions?pendientes=1 → «Llegadas pendientes» (lotes en
//   camino con lo esperado y el depósito sugerido); ?id= → detalle.
// - POST  /api/supply/receptions → abre (o retoma) la recepción de un lote por
//   id, código o token del QR del manifiesto.
// - PATCH /api/supply/receptions → scan (IMEI contra lo esperado) · item
//   (dañado/incorrecto/faltante con nota) · confirm (crea stock) · cancel.
//
// El stock se crea **solo al confirmar** y solo para las unidades RECIBIDAS; los
// faltantes/sobrantes/dañados/incorrectos quedan como incidencia.
const ESTADOS_LLEGADA = ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA', 'RECEPCION_PARCIAL']
const INCLUDE_RECEPCION = {
  shipment: { include: { purchase: { select: { code: true, currency: true, originalCost: true, exchangeRatePyg: true, costPyg: true, lines: { select: { id: true, productId: true, condition: true, quantity: true, unitCostPyg: true } } } }, destinationBranch: { select: { id: true, name: true } }, items: { select: { id: true, serial: true, productId: true, status: true, lineId: true } } } },
  location: { select: { id: true, name: true, code: true } },
  receivedBy: { select: { id: true, name: true } },
  items: { select: { id: true, shipmentItemId: true, serial: true, productId: true, resultado: true, nota: true } },
} as const

async function ubicacionSugerida(tenant: string, branchId: string | null) {
  if (!branchId) return null
  const ultima = await prisma.supplyReception.findFirst({ where: { tenantId: tenant, locationId: { not: null }, shipment: { destinationBranchId: branchId } }, orderBy: { createdAt: 'desc' }, select: { location: { select: { id: true, name: true, code: true } } } })
  if (ultima?.location) return ultima.location
  const primera = await prisma.stockLocation.findFirst({ where: { tenantId: tenant, branchId, isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } })
  return primera
}

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const id = (params.get('id') || '').trim()
  if (id) {
    const recepcion = await prisma.supplyReception.findFirst({ where: { id, tenantId: tenant }, include: INCLUDE_RECEPCION })
    if (!recepcion) return error('Recepción no encontrada.', 404)
    return json({ recepcion, esperados: recepcion.shipment.items, resumen: resumenRecepcion(recepcion.items) })
  }

  if (params.get('pendientes') === '1') {
    const envios = await prisma.supplyShipment.findMany({
      where: { tenantId: tenant, status: { in: ESTADOS_LLEGADA }, ...(params.get('purchaseId') ? { purchaseId: String(params.get('purchaseId')) } : {}) },
      orderBy: [{ etaAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
      include: { purchase: { select: { code: true } }, destinationBranch: { select: { id: true, name: true } }, items: { select: { id: true, serial: true } } },
    })
    const abiertas = await prisma.supplyReception.findMany({ where: { tenantId: tenant, status: 'BORRADOR', shipmentId: { in: envios.map((envio) => envio.id) } }, select: { id: true, shipmentId: true } })
    const abiertaDe = new Map(abiertas.map((fila) => [fila.shipmentId, fila.id]))
    return json({
      fecha: new Date().toISOString(),
      totales: { llegadas: envios.length, unidades: envios.reduce((suma, envio) => suma + envio.items.length, 0) },
      llegadas: await Promise.all(envios.map(async (envio) => ({
        id: envio.id,
        code: envio.code,
        compra: envio.purchase?.code || null,
        origen: envio.origin,
        metodo: envio.method,
        empresa: envio.company,
        eta: envio.etaAt,
        salida: envio.sentAt,
        estado: envio.status,
        destino: envio.destinationBranch?.name || null,
        destinoBranchId: envio.destinationBranchId,
        unidades: envio.items.length,
        conImei: envio.items.filter((item) => item.serial).length,
        pendientes: envio.items.filter((item) => !item.serial).length,
        recepcionAbiertaId: abiertaDe.get(envio.id) || null,
        ubicacionSugerida: await ubicacionSugerida(tenant, envio.destinationBranchId),
      }))),
    })
  }

  const status = (params.get('status') || '').trim().toUpperCase()
  const recepciones = await prisma.supplyReception.findMany({
    where: { tenantId: tenant, ...(status ? { status } : {}), ...(params.get('shipmentId') ? { shipmentId: String(params.get('shipmentId')) } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(200, Math.max(1, Number(params.get('limit')) || 50)),
    include: INCLUDE_RECEPCION,
  })
  return json({
    fecha: new Date().toISOString(),
    totales: { recepciones: recepciones.length },
    recepciones: recepciones.map((recepcion) => ({ id: recepcion.id, status: recepcion.status, createdAt: recepcion.createdAt, receivedAt: recepcion.receivedAt, envio: recepcion.shipment.code, location: recepcion.location, resumen: resumenRecepcion(recepcion.items) })),
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
  const shipmentId = typeof body?.shipmentId === 'string' ? body.shipmentId.trim() : ''
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!shipmentId && !code && !token) return error('Indicá el envío (id, código o token del manifiesto).')
  const envio = await prisma.supplyShipment.findFirst({ where: { tenantId: tenant, ...(shipmentId ? { id: shipmentId } : code ? { code } : { publicToken: token }) }, include: { items: true, purchase: true } })
  if (!envio) return error('Envío no encontrado.', 404)
  if (!ESTADOS_LLEGADA.includes(envio.status)) return error(`El envío está en ${envio.status}: no hay nada para recibir.`, 409)

  const existente = await prisma.supplyReception.findFirst({ where: { tenantId: tenant, shipmentId: envio.id, status: 'BORRADOR' }, include: INCLUDE_RECEPCION })
  if (existente) return json({ recepcion: existente, esperados: existente.shipment.items, resumen: resumenRecepcion(existente.items), retomada: true })

  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : null
  if (locationId) {
    const deposito = await prisma.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, isActive: true }, select: { id: true, branchId: true } })
    if (!deposito) return error('Depósito no encontrado.', 404)
    if (envio.destinationBranchId && deposito.branchId !== envio.destinationBranchId) return error('El depósito no pertenece a la sucursal destino.', 400)
  }

  const creada = await prisma.$transaction(async (tx) => {
    const recepcion = await tx.supplyReception.create({
      data: { tenantId: tenant, shipmentId: envio.id, locationId, status: 'BORRADOR', createdById: session.user.id },
    })
    await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_RECEPTION_STARTED', entity: 'SupplyReception', entityId: recepcion.id, metadata: { envio: envio.code, unidades: envio.items.length, locationId } } })
    return recepcion
  })
  const conDetalle = await prisma.supplyReception.findFirst({ where: { id: creada.id, tenantId: tenant }, include: INCLUDE_RECEPCION })
  return json({ recepcion: conDetalle, esperados: conDetalle!.shipment.items, resumen: resumenRecepcion([]) }, { status: 201 })
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
  if (!id) return error('Indicá la recepción.')
  const recepcion = await prisma.supplyReception.findFirst({ where: { id, tenantId: tenant }, include: INCLUDE_RECEPCION })
  if (!recepcion) return error('Recepción no encontrada.', 404)
  if (recepcion.status !== 'BORRADOR') return error('La recepción ya está cerrada.', 409)
  const accion = ['scan', 'item', 'confirm', 'cancel'].includes(body?.action) ? body.action : null
  if (!accion) return error('Acción inválida: usá scan, item, confirm o cancel.')

  if (accion === 'cancel') {
    const cancelada = await prisma.$transaction(async (tx) => {
      const fila = await tx.supplyReception.update({ where: { id: recepcion.id }, data: { status: 'CANCELADA' } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_RECEPTION_CANCELLED', entity: 'SupplyReception', entityId: fila.id, metadata: { envio: recepcion.shipment.code } } })
      return fila
    })
    return json({ recepcion: cancelada })
  }

  if (accion === 'scan') {
    const seriales = normalizarSeriales(body?.serial ?? body?.serials)
    if (!seriales.ok) return error(seriales.error)
    const nuevos = seriales.seriales
    if (!nuevos.length) return error('Escaneá al menos un IMEI/serial.')
    const resultadoPedido = typeof body?.resultado === 'string' && (RESULTADOS_RECEPCION as readonly string[]).includes(body.resultado.toUpperCase()) ? body.resultado.toUpperCase() : 'RECIBIDO'
    const yaEscaneados = new Set(recepcion.items.filter((item) => item.serial === null || item.serial).map((item) => String(item.serial || '').toUpperCase()))
    const cubiertos = new Set(recepcion.items.map((item) => item.shipmentItemId).filter(Boolean) as string[])
    const registrados = []
    for (const serial of nuevos) {
      if (yaEscaneados.has(serial)) return error(`El IMEI ${serial} ya se escaneó en esta recepción.`)
      // Coincide con un IMEI del manifiesto o completa una unidad con IMEI diferido.
      const esperado = recepcion.shipment.items.find((item) => String(item.serial || '').toUpperCase() === serial && !cubiertos.has(item.id))
      const pendiente = recepcion.shipment.items.find((item) => !item.serial && !cubiertos.has(item.id))
      const item = esperado || pendiente || null
      const resultado = item ? resultadoPedido : 'SOBRANTE'
      const fila = await prisma.supplyReceptionItem.create({
        data: { tenantId: tenant, receptionId: recepcion.id, shipmentItemId: item?.id || null, serial, productId: item?.productId || recepcion.shipment.items[0]?.productId || '', resultado, nota: typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : null },
      })
      if (item) cubiertos.add(item.id)
      yaEscaneados.add(serial)
      registrados.push(fila)
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_RECEPTION_SCANNED', entity: 'SupplyReception', entityId: recepcion.id, metadata: { envio: recepcion.shipment.code, serial, resultado } } })
    }
    const detalle = await prisma.supplyReception.findFirst({ where: { id: recepcion.id, tenantId: tenant }, include: INCLUDE_RECEPCION })
    return json({ recepcion: detalle, registrados: registrados.length, resumen: resumenRecepcion(detalle!.items) }, { status: 201 })
  }

  if (accion === 'item') {
    const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : ''
    const item = recepcion.items.find((fila) => fila.id === itemId)
    if (!item) return error('Unidad de la recepción no encontrada.', 404)
    const resultado = typeof body?.resultado === 'string' ? body.resultado.trim().toUpperCase() : ''
    if (!(RESULTADOS_RECEPCION as readonly string[]).includes(resultado)) return error('Resultado inválido.')
    const nota = typeof body?.nota === 'string' && body.nota.trim() ? body.nota.trim().slice(0, 300) : null
    if (RESULTADOS_INCIDENCIA.includes(resultado as never) && !nota) return error('Una incidencia necesita una nota.')
    const actualizado = await prisma.supplyReceptionItem.update({ where: { id: item.id }, data: { resultado, nota } })
    if (RESULTADOS_INCIDENCIA.includes(resultado as never)) {
      await prisma.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_RECEPTION_INCIDENT', entity: 'SupplyReception', entityId: recepcion.id, metadata: { envio: recepcion.shipment.code, serial: item.serial, resultado, nota } } })
    }
    return json({ item: actualizado })
  }

  // confirm: recién acá nace el stock.
  const locationId = typeof body?.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : recepcion.locationId
  if (!locationId) return error('Elegí el depósito destino.')
  if (!recepcion.shipment.destinationBranchId) return error('El envío no tiene sucursal destino: no se puede recibir en stock.', 409)
  const deposito = await prisma.stockLocation.findFirst({ where: { id: locationId, tenantId: tenant, branchId: recepcion.shipment.destinationBranchId, isActive: true }, select: { id: true, name: true } })
  if (!deposito) return error('Depósito destino inválido para la sucursal.', 400)

  const lineas = new Map(recepcion.shipment.purchase.lines.map((linea) => [linea.id, linea]))
  const esperados = recepcion.shipment.items
  const unidadesCompra = recepcion.shipment.purchase.lines.reduce((suma, linea) => suma + linea.quantity, 0)
  const confirmada = await prisma.$transaction(async (tx) => {
    const creadas: string[] = []
    for (const item of recepcion.items) {
      if (item.resultado !== 'RECIBIDO') continue
      const esperado = esperados.find((fila) => fila.id === item.shipmentItemId)
      const linea = esperado ? lineas.get(esperado.lineId) : recepcion.shipment.purchase.lines[0]
      if (!esperado || !linea || !item.serial) continue
      const existente = await tx.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: item.serial }, select: { serial: true } })
      if (existente) throw new Error(`El IMEI ${item.serial} ya está en el inventario.`)
      const costo = costoPorUnidad({
        totalCostPyg: recepcion.shipment.purchase.costPyg,
        totalOriginal: recepcion.shipment.purchase.originalCost === null ? null : Number(recepcion.shipment.purchase.originalCost),
        currency: recepcion.shipment.purchase.currency,
        rate: recepcion.shipment.purchase.exchangeRatePyg === null ? null : Number(recepcion.shipment.purchase.exchangeRatePyg),
        unidades: unidadesCompra,
        unitCostPyg: linea.unitCostPyg,
      })
      const unidad = await tx.inventoryUnit.create({
        data: {
          tenantId: tenant,
          productId: item.productId,
          branchId: recepcion.shipment.destinationBranchId,
          locationId: deposito.id,
          serial: item.serial,
          condition: linea.condition,
          costCurrency: costo.costCurrency as PaymentCurrency,
          costPyg: costo.costPyg,
          originalCost: costo.originalCost,
          exchangeRatePyg: costo.exchangeRatePyg,
        },
      })
      creadas.push(unidad.id)
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'INVENTORY_UNIT_RECEIVED', entity: 'InventoryUnit', entityId: unidad.id, metadata: { serial: item.serial, productId: item.productId, branchId: recepcion.shipment.destinationBranchId, locationId: deposito.id, envio: recepcion.shipment.code } } })
      await tx.supplyShipmentItem.update({ where: { id: esperado.id }, data: { status: 'RECIBIDO' } })
    }
    // Lo esperado sin escanear queda faltante (no entra al stock).
    const cubiertos = new Set(recepcion.items.map((item) => item.shipmentItemId).filter(Boolean) as string[])
    for (const esperado of esperados) {
      if (cubiertos.has(esperado.id)) continue
      await tx.supplyReceptionItem.create({ data: { tenantId: tenant, receptionId: recepcion.id, shipmentItemId: esperado.id, serial: esperado.serial, productId: esperado.productId, resultado: 'FALTANTE' } })
      await tx.supplyShipmentItem.update({ where: { id: esperado.id }, data: { status: 'FALTANTE' } })
    }
    if (creadas.length) {
      const porProducto = new Map<string, number>()
      for (const item of recepcion.items.filter((fila) => fila.resultado === 'RECIBIDO')) porProducto.set(item.productId, (porProducto.get(item.productId) || 0) + 1)
      for (const [productId, cantidad] of porProducto) await changeStock(tx, { tenantId: tenant, productId, delta: cantidad })
    }
    const items = await tx.supplyReceptionItem.findMany({ where: { receptionId: recepcion.id }, select: { resultado: true } })
    const resumen = resumenRecepcion(items)
    const estado = estadoLoteRecepcion({ unidades: esperados.length, recibidas: resumen.RECIBIDO, incidencias: resumen.SOBRANTE + resumen.DANADO + resumen.INCORRECTO })
    const fila = await tx.supplyReception.update({ where: { id: recepcion.id }, data: { status: 'CONFIRMADA', receivedById: session.user.id, receivedAt: new Date(), locationId: deposito.id, notes: typeof body?.notas === 'string' && body.notas.trim() ? body.notas.trim().slice(0, 500) : null } })
    await tx.supplyShipment.update({ where: { id: recepcion.shipmentId }, data: { status: estado, arrivedAt: new Date() } })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'SUPPLY_RECEPTION_CONFIRMED',
        entity: 'SupplyReception',
        entityId: fila.id,
        metadata: { envio: recepcion.shipment.code, deposito: deposito.name, unidades: esperados.length, recibidas: resumen.RECIBIDO, faltantes: resumen.FALTANTE, sobrantes: resumen.SOBRANTE, danados: resumen.DANADO, incorrectos: resumen.INCORRECTO, stockCreado: creadas.length, estadoLote: estado },
      },
    })
    return { id: fila.id, creadas: creadas.length, resumen, estado }
  }).catch((cause: any) => {
    if (cause instanceof Error) return cause.message
    throw cause
  })
  if (typeof confirmada === 'string') return error(confirmada, 409)

  const detalle = await prisma.supplyReception.findFirst({ where: { id: recepcion.id, tenantId: tenant }, include: INCLUDE_RECEPCION })
  return json({ recepcion: detalle, resumen: confirmada.resumen, estadoLote: confirmada.estado, unidadesCreadas: confirmada.creadas })
}
