import { prisma } from '../../../../lib/prisma'
import { error, json, tenantId } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { codigoEnvio, ENVIO_ESTADOS, ENVIO_ESTADOS_RECEPCION, expandirItemsEnvio, METODOS_ENVIO, transicionEnvioValida } from '../../../../lib/supply'
import { aexQuote, aexWebTrackingUrl } from '../../../../lib/aex'

// #250 Fase 4 (Centro de Abastecimiento): lotes/envíos entrantes de una compra.
//
// - GET   /api/supply/shipments  → lotes con su compra, destino y unidades.
// - POST  /api/supply/shipments  → crea el lote (una compra puede dividirse en
//   varios) con método (bus/transportadora/AEX/importación) y sus unidades
//   (IMEI conocido o pendiente).
// - PATCH /api/supply/shipments  → prepare · dispatch · transit · incidencia ·
//   cancel (transiciones validadas). La recepción es de la Fase 5.
//
// Las compras externas se registran acá (envío entrante); **nunca** como
// traslado interno. El lote no mueve stock.
const INCLUDE_ENVIO = {
  purchase: { select: { id: true, code: true, supplierName: true } },
  destinationBranch: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true } },
  items: { select: { id: true, lineId: true, productId: true, serial: true, status: true } },
} as const

export async function GET(request: Request) {
  const tenant = await tenantId(request)
  if (!tenant) return error('Falta sesión.', 401)
  const session = await requireSession(request)
  if (!session) return error('Sesión inválida.', 401)
  if (!canAccessAny(session.user, ['stock:manage'])) return error('No autorizado.', 403)

  const params = new URL(request.url).searchParams
  const status = (params.get('status') || '').trim().toUpperCase()
  const purchaseId = (params.get('purchaseId') || '').trim()
  const method = (params.get('method') || '').trim().toUpperCase()
  const limite = Math.min(200, Math.max(1, Number(params.get('limit')) || 50))

  const envios = await prisma.supplyShipment.findMany({
    where: { tenantId: tenant, ...(status ? { status } : {}), ...(purchaseId ? { purchaseId } : {}), ...(method ? { method } : {}) },
    orderBy: [{ createdAt: 'desc' }],
    take: limite,
    include: INCLUDE_ENVIO,
  })
  return json({
    fecha: new Date().toISOString(),
    totales: { envios: envios.length, unidades: envios.reduce((suma, envio) => suma + envio.items.length, 0) },
    envios: envios.map((envio) => ({
      ...envio,
      unidades: envio.items.length,
      conImei: envio.items.filter((item) => item.serial).length,
      pendientes: envio.items.filter((item) => !item.serial).length,
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
  const purchaseId = typeof body?.purchaseId === 'string' ? body.purchaseId.trim() : ''
  if (!purchaseId) return error('Indicá la compra del envío.')
  const compra = await prisma.supplyPurchase.findFirst({
    where: { id: purchaseId, tenantId: tenant },
    include: { lines: { include: { serials: { select: { serial: true } } }, orderBy: { createdAt: 'asc' } } },
  })
  if (!compra) return error('Compra no encontrada.', 404)
  if (compra.status === 'CANCELADA') return error('La compra está cancelada.', 409)

  const method = typeof body?.method === 'string' ? body.method.trim().toUpperCase() : ''
  if (!(METODOS_ENVIO as readonly string[]).includes(method)) return error('Método inválido: usá BUS, TRANSPORTADORA, AEX o IMPORTACION.')
  const origin = typeof body?.origin === 'string' && body.origin.trim() ? body.origin.trim().toUpperCase().slice(0, 3) : 'CDE'
  const destinationBranchId = typeof body?.destinationBranchId === 'string' && body.destinationBranchId.trim() ? body.destinationBranchId.trim() : null
  let destino = 'ASU'
  if (destinationBranchId) {
    const sucursal = await prisma.branch.findFirst({ where: { id: destinationBranchId, tenantId: tenant }, select: { id: true, name: true } })
    if (!sucursal) return error('Sucursal destino no encontrada.', 404)
    destino = sucursal.name
  }
  const responsibleId = typeof body?.responsibleId === 'string' && body.responsibleId.trim() ? body.responsibleId.trim() : null
  if (responsibleId) {
    const responsable = await prisma.user.findFirst({ where: { id: responsibleId, tenantId: tenant }, select: { id: true } })
    if (!responsable) return error('Responsable no encontrado.', 404)
  }
  const etaCrudo = body?.etaAt
  const etaAt = etaCrudo ? new Date(String(etaCrudo)) : null
  if (etaCrudo && Number.isNaN(etaAt!.getTime())) return error('La ETA no es válida.')

  // Unidades: las líneas pedidas (o todo lo que falta) con sus IMEI disponibles.
  const pedidas = Array.isArray(body?.lines) && body.lines.length
    ? body.lines.map((fila: any) => ({ lineId: String(fila?.lineId || '').trim(), quantity: fila?.quantity === undefined ? null : Number(fila.quantity) }))
    : compra.lines.map((linea) => ({ lineId: linea.id, quantity: null }))
  const lineasCompra = new Map(compra.lines.map((linea) => [linea.id, linea]))
  const seleccion: Array<{ id: string; productId: string; quantity: number; serials: string[] }> = []
  for (const pedida of pedidas) {
    const linea = lineasCompra.get(pedida.lineId)
    if (!linea) return error('Alguna línea no pertenece a la compra.', 404)
    const cantidad = pedida.quantity === null || pedida.quantity === undefined ? linea.quantity : pedida.quantity
    if (!Number.isInteger(cantidad) || cantidad < 1) return error('La cantidad por línea debe ser un entero positivo.')
    seleccion.push({ id: linea.id, productId: linea.productId, quantity: cantidad, serials: linea.serials.map((fila) => fila.serial) })
  }

  // Lo que ya viaja en otros lotes de la misma compra (o en cualquiera).
  const yaEnLotes = await prisma.supplyShipmentItem.findMany({ where: { tenantId: tenant, line: { purchaseId } }, select: { lineId: true, serial: true } })
  const asignados = yaEnLotes.map((fila) => ({ lineId: fila.lineId, serial: fila.serial, cantidad: 1 }))
  const expansion = expandirItemsEnvio({ lineas: seleccion, asignados })
  if (!expansion.ok) return error(expansion.error)
  const seriales = expansion.items.map((item) => item.serial).filter(Boolean) as string[]
  if (seriales.length) {
    const enStock = await prisma.inventoryUnit.findFirst({ where: { tenantId: tenant, serial: { in: seriales } }, select: { serial: true } })
    if (enStock) return error(`El IMEI ${enStock.serial} ya está en el inventario.`, 409)
  }

  let code = typeof body?.code === 'string' && body.code.trim() ? body.code.trim().toUpperCase() : ''
  if (code && !/^[A-Z0-9-]{4,32}$/.test(code)) return error('El código del envío no es válido.')
  if (!code) {
    const total = await prisma.supplyShipment.count({ where: { tenantId: tenant } })
    code = codigoEnvio({ origen: origin, destino: destino.slice(0, 3), secuencia: total + 1 })
  }
  if (await prisma.supplyShipment.findFirst({ where: { tenantId: tenant, code }, select: { id: true } })) return error(`El código ${code} ya existe.`, 409)

  const creado = await prisma.$transaction(async (tx) => {
    const envio = await tx.supplyShipment.create({
      data: {
        tenantId: tenant,
        code,
        purchaseId,
        origin,
        destinationBranchId,
        method,
        company: typeof body?.company === 'string' && body.company.trim() ? body.company.trim().slice(0, 120) : null,
        driver: typeof body?.driver === 'string' && body.driver.trim() ? body.driver.trim().slice(0, 120) : null,
        guide: typeof body?.guide === 'string' && body.guide.trim() ? body.guide.trim().slice(0, 120) : null,
        responsibleId,
        status: 'BORRADOR',
        etaAt,
        notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
        createdById: session.user.id,
      },
    })
    await tx.supplyShipmentItem.createMany({
      data: expansion.items.map((item) => ({ tenantId: tenant, shipmentId: envio.id, lineId: item.lineId, productId: item.productId, serial: item.serial })),
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: 'SUPPLY_SHIPMENT_CREATED',
        entity: 'SupplyShipment',
        entityId: envio.id,
        metadata: { code, purchaseId, origin, destino, method, unidades: expansion.items.length, pendientes: expansion.items.filter((item) => !item.serial).length },
      },
    })
    return envio
  })

  return json(await prisma.supplyShipment.findFirst({ where: { id: creado.id, tenantId: tenant }, include: INCLUDE_ENVIO }), { status: 201 })
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
  if (!id) return error('Indicá el envío.')
  const envio = await prisma.supplyShipment.findFirst({ where: { id, tenantId: tenant } })
  if (!envio) return error('Envío no encontrado.', 404)

  const accion = ['prepare', 'dispatch', 'transit', 'incidencia', 'cancel', 'status', 'aex-quote', 'aex-guide'].includes(body?.action) ? body.action : null
  if (!accion) return error('Acción inválida: usá prepare, dispatch, transit, incidencia, cancel, status, aex-quote o aex-guide.')

  // #250 Fase 6: AEX ampliado — cotización del lote y guía, con los mismos
  // servicios de los traslados. La confirmación del envío sigue bloqueada hasta
  // contar con los datos reales del remitente y destinatario.
  if (accion === 'aex-quote' || accion === 'aex-guide') {
    const destino = await prisma.branch.findFirst({ where: { id: envio.destinationBranchId || '' }, select: { name: true, city: true } })
    const ciudadDestino = destino?.city || destino?.name || envio.origin
    if (accion === 'aex-quote') {
      const pesoKg = body?.pesoKg === undefined || body?.pesoKg === null || body?.pesoKg === '' ? 1 : Number(body.pesoKg)
      if (!Number.isFinite(pesoKg) || pesoKg <= 0 || pesoKg > 500) return error('Indicá un peso válido en kg (hasta 500).')
      const cotizaciones = await aexQuote(envio.origin, ciudadDestino, pesoKg)
      if (cotizaciones === null) return json({ unconfigured: true, webUrl: aexWebTrackingUrl(''), origen: envio.origin, destino: ciudadDestino, quotes: [] })
      return json({ unconfigured: false, origen: envio.origin, destino: ciudadDestino, quotes: cotizaciones })
    }
    const guia = typeof body?.guide === 'string' ? body.guide.trim().slice(0, 120) : ''
    if (guia.length < 3) return error('Indicá el número de guía AEX.')
    if (['CANCELADO', 'RECIBIDO'].includes(envio.status)) return error('El envío ya está cerrado.', 409)
    const conGuia = await prisma.$transaction(async (tx) => {
      const fila = await tx.supplyShipment.update({ where: { id: envio.id }, data: { guide: guia, company: 'AEX', method: 'AEX' } })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'SUPPLY_SHIPMENT_AEX_GUIDE', entity: 'SupplyShipment', entityId: fila.id, metadata: { code: fila.code, guide: guia, origen: envio.origin, destino: ciudadDestino } } })
      return fila
    })
    return json(await prisma.supplyShipment.findFirst({ where: { id: conGuia.id, tenantId: tenant }, include: INCLUDE_ENVIO }))
  }
  let hacia = accion === 'prepare' ? 'PREPARANDO' : accion === 'dispatch' ? 'DESPACHADO' : accion === 'transit' ? 'EN_TRANSITO' : accion === 'incidencia' ? 'CON_INCIDENCIA' : accion === 'cancel' ? 'CANCELADO' : ''
  if (accion === 'status') {
    hacia = String(body?.status || '').trim().toUpperCase()
    if (!(ENVIO_ESTADOS as readonly string[]).includes(hacia)) return error('Estado de envío inválido.')
    if ((ENVIO_ESTADOS_RECEPCION as readonly string[]).includes(hacia)) return error('La recepción del lote llega en la Fase 5.', 409)
  }
  if (!transicionEnvioValida(envio.status, hacia)) return error(`No se puede pasar de ${envio.status} a ${hacia}.`, 409)

  const motivo = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if ((accion === 'incidencia' || accion === 'cancel') && motivo.length < 3) return error('Indicá el motivo (mínimo 3 caracteres).')
  const guia = typeof body?.guide === 'string' && body.guide.trim() ? body.guide.trim().slice(0, 120) : envio.guide
  if (accion === 'dispatch' && !guia && !envio.company) return error('Para despachar indicá la guía o la empresa de transporte.')

  const actualizado = await prisma.$transaction(async (tx) => {
    const fila = await tx.supplyShipment.update({
      where: { id: envio.id },
      data: {
        status: hacia,
        ...(accion === 'dispatch' ? { sentAt: new Date(), guide: guia } : {}),
        ...(accion === 'incidencia' ? { arrivedAt: envio.arrivedAt, notes: motivo.slice(0, 500) } : {}),
        ...(accion === 'cancel' ? { notes: motivo.slice(0, 500) } : {}),
      },
    })
    await tx.auditLog.create({
      data: {
        tenantId: tenant,
        userId: session.user.id,
        action: accion === 'dispatch' ? 'SUPPLY_SHIPMENT_DISPATCHED' : accion === 'incidencia' ? 'SUPPLY_SHIPMENT_INCIDENT' : accion === 'cancel' ? 'SUPPLY_SHIPMENT_CANCELLED' : 'SUPPLY_SHIPMENT_UPDATED',
        entity: 'SupplyShipment',
        entityId: fila.id,
        metadata: { code: fila.code, from: envio.status, to: hacia, ...(motivo ? { reason: motivo.slice(0, 500) } : {}) },
      },
    })
    return fila
  })
  return json(await prisma.supplyShipment.findFirst({ where: { id: actualizado.id, tenantId: tenant }, include: INCLUDE_ENVIO }))
}
