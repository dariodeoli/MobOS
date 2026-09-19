import { Prisma } from '@prisma/client'
import { prisma } from '../../../../lib/prisma'
import { error } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import type { SessionContext } from '../../../../lib/auth'
import { csvResponse } from '../../../../lib/csv'
import { INVENTORY_REMOVED, INVENTORY_RESTORED, removedInventoryUnitIds } from '../../../../lib/inventory'
import { MAX_REPORT_ORDERS, REPORT_ROLES, aggregateCommissions, dayBounds, parseReportQuery } from '../../../../lib/reporting'
import { serialKey } from '../../../../lib/validation'
import { ensureStoreBranch } from '../../../../lib/store-branch'
import { ACCIONES_AUDITORIA, AREAS_AUDITORIA, ROLES_AUDITORIA, detalleAuditoria, parseFiltrosAuditoria, whereAuditoria } from '../../../../lib/audit'

// Exportaciones CSV por módulo: mismo alcance por rol y mismos filtros que el
// listado visible, un solo tope de filas y auditoría DATA_EXPORTED por archivo.
const MODULES = ['customers', 'inventory-units', 'purchases', 'cash-movements', 'warranties', 'commissions', 'audit.csv'] as const
type ExportModule = (typeof MODULES)[number]

const MAX_EXPORT_ROWS = 5000

class ExportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const texto = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const fechaCsv = (value: Date | null | undefined) => value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().slice(0, 10) : ''

// Etiquetas visibles en el CSV: mismo vocabulario que la interfaz.
const ESTADOS_UNIDAD: Record<string, string> = { AVAILABLE: 'Disponible', RESERVED: 'Reservado', SOLD: 'Vendido', DEFECTIVE: 'En revisión', IN_TRANSIT: 'En tránsito' }
const CONDICIONES_UNIDAD: Record<string, string> = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const ESTADOS_COMPRA: Record<string, string> = { DRAFT: 'Borrador', RECEIVED: 'Recibida' }
const ESTADOS_GARANTIA: Record<string, string> = { RECEIVED: 'Recibido', DIAGNOSIS: 'En diagnóstico', READY: 'Listo para retirar', DELIVERED: 'Entregado' }
const TIPOS_MOVIMIENTO: Record<string, string> = { EXPENSE: 'Gasto', TRANSFER: 'Transferencia', SUPPLIER_ADVANCE: 'Adelanto a proveedor', CHEQUE: 'Cheque', OWNER_WITHDRAWAL: 'Retiro del dueño', ADJUSTMENT: 'Ajuste' }
const ESTADOS_MOVIMIENTO: Record<string, string> = { PENDING: 'Pendiente', CLEARED: 'Cobrado', VOID: 'Anulado' }
const DIRECCIONES_MOVIMIENTO: Record<string, string> = { IN: 'Ingreso', OUT: 'Salida' }

// Unidad "en pantalla": la venta ya entregada salió del local y no se lista.
const UNIDAD_EN_PANTALLA = Prisma.sql`NOT (u."status" = 'SOLD' AND (
  SELECT o."fulfillmentStatus"::text
  FROM "OrderItemSerial" s
  JOIN "OrderItem" i ON i."id" = s."orderItemId"
  JOIN "Order" o ON o."id" = i."orderId"
  WHERE s."serial" = u."serial" AND o."tenantId" = u."tenantId"
  ORDER BY o."createdAt" DESC
  LIMIT 1
) = 'DELIVERED')`

type Exportacion = {
  encabezados: string[]
  filas: Array<Array<string | number>>
  filtros: Record<string, unknown>
  nombre: string
}

export async function GET(request: Request, { params }: { params: { module: string } }) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const module = texto(params.module).slice(0, 40) as ExportModule
  if (!(MODULES as readonly string[]).includes(module)) return error('Módulo de exportación inválido.', 404)
  try {
    const exportacion = await construirExportacion(module, session, new URL(request.url).searchParams)
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: 'DATA_EXPORTED',
        entity: module,
        entityId: session.user.tenantId,
        metadata: {
          filtros: exportacion.filtros,
          filas: exportacion.filas.length,
          truncado: exportacion.filas.length >= MAX_EXPORT_ROWS,
        } as Prisma.InputJsonValue,
      },
    })
    return csvResponse(exportacion.encabezados, exportacion.filas, exportacion.nombre)
  } catch (cause) {
    if (cause instanceof ExportError) return error(cause.message, cause.status)
    return error('No se pudo exportar el CSV.', 500)
  }
}

function construirExportacion(module: ExportModule, session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  switch (module) {
    case 'customers': return exportarClientes(session, params)
    case 'inventory-units': return exportarUnidades(session, params)
    case 'purchases': return exportarCompras(session, params)
    case 'cash-movements': return exportarMovimientos(session, params)
    case 'warranties': return exportarGarantias(session, params)
    case 'commissions': return exportarComisiones(session, params)
    case 'audit.csv': return exportarAuditoria(session, params)
  }
}

/* ── Clientes ───────────────────────────────────────────────────────── */

const FILTROS_CLIENTES = new Set(['todos', 'mayoristas', 'minoristas', 'deuda', 'credito', 'sincredito', 'conemail'])
const patronLike = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`
const esMayorista = (customer: { name: string; tags?: string[] }) => {
  const tags = Array.isArray(customer.tags) ? customer.tags : []
  return tags.some((tag) => tag.toLowerCase().includes('mayorista')) || customer.name.toLowerCase().includes('mayorista')
}

async function exportarClientes(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  const tenant = session.user.tenantId
  const filtro = texto(params.get('filtro')) || 'todos'
  if (!FILTROS_CLIENTES.has(filtro)) throw new ExportError('Filtro inválido.', 400)
  const q = texto(params.get('q')).slice(0, 120)
  const encabezados = ['Cliente', 'Documento', 'Teléfono', 'Correo', 'Ciudad', 'Mayorista', 'Límite de crédito', 'Pedidos', 'Total gastado', 'Saldo']
  const filtros = { q, filtro }
  const condiciones: Prisma.Sql[] = [Prisma.sql`c."tenantId" = ${tenant}`]
  if (filtro === 'mayoristas') condiciones.push(Prisma.sql`c."pricingTier" = 'WHOLESALE'`)
  else if (filtro === 'minoristas') condiciones.push(Prisma.sql`c."pricingTier" <> 'WHOLESALE'`)
  else if (filtro === 'credito') condiciones.push(Prisma.sql`COALESCE(c."creditLimitPyg", 0) > 0`)
  else if (filtro === 'sincredito') condiciones.push(Prisma.sql`COALESCE(c."creditLimitPyg", 0) = 0`)
  else if (filtro === 'conemail') condiciones.push(Prisma.sql`c."email" IS NOT NULL AND c."email" <> ''`)
  else if (filtro === 'deuda') condiciones.push(Prisma.sql`EXISTS (
    SELECT 1 FROM "Order" o
    LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
    WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND o."status" = 'PENDING' AND o."totalPyg" - COALESCE(p."paid", 0) > 0
  )`)
  if (q) {
    const patron = patronLike(q)
    condiciones.push(Prisma.sql`(
      c."name" ILIKE ${patron}
      OR c."phone" ILIKE ${patron}
      OR c."document" ILIKE ${patron}
      OR c."email" ILIKE ${patron}
      OR c."billingName" ILIKE ${patron}
      OR c."billingDocument" ILIKE ${patron}
      OR c."tags"::text ILIKE ${patron}
      OR EXISTS (SELECT 1 FROM "CustomerAddress" a WHERE a."customerId" = c."id" AND (a."city" ILIKE ${patron} OR a."address" ILIKE ${patron}))
      OR EXISTS (SELECT 1 FROM "Order" o WHERE o."customerId" = c."id" AND o."tenantId" = ${tenant} AND (o."billingName" ILIKE ${patron} OR o."billingDocument" ILIKE ${patron}))
    )`)
  }
  const ids = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT c."id" FROM "Customer" c
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY c."createdAt" DESC, c."id" DESC
    LIMIT ${MAX_EXPORT_ROWS}`)
  if (!ids.length) return { encabezados, filas: [], filtros, nombre: 'mobos-clientes.csv' }
  const idList = ids.map((row) => row.id)
  const [clientes, stats, deudas] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: idList } }, include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } } }),
    prisma.order.groupBy({
      by: ['customerId'],
      where: { tenantId: tenant, customerId: { in: idList }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
      _sum: { totalPyg: true },
    }),
    prisma.$queryRaw<Array<{ customerId: string; deuda: bigint }>>(Prisma.sql`
      SELECT o."customerId", COALESCE(SUM(GREATEST(o."totalPyg" - COALESCE(p."paid", 0), 0)), 0)::bigint AS deuda
      FROM "Order" o
      LEFT JOIN (SELECT "orderId", SUM("amountPyg") AS paid FROM "Payment" WHERE "tenantId" = ${tenant} AND "status" = 'CONFIRMED' GROUP BY "orderId") p ON p."orderId" = o."id"
      WHERE o."tenantId" = ${tenant} AND o."status" = 'PENDING' AND o."customerId" IN (${Prisma.join(idList)})
      GROUP BY o."customerId"`),
  ])
  const porId = new Map(clientes.map((cliente) => [cliente.id, cliente]))
  const statsPorId = new Map(stats.map((fila) => [fila.customerId, { orders: fila._count._all, totalSpentPyg: fila._sum.totalPyg ?? 0 }]))
  const deudaPorId = new Map(deudas.map((fila) => [fila.customerId, Number(fila.deuda)]))
  const filas: Array<Array<string | number>> = []
  for (const id of idList) {
    const cliente = porId.get(id)
    if (!cliente) continue
    const stat = statsPorId.get(id) || { orders: 0, totalSpentPyg: 0 }
    filas.push([
      cliente.name,
      cliente.document || '',
      [cliente.countryCode, cliente.phone].filter(Boolean).join(' '),
      cliente.email || '',
      cliente.addresses[0]?.city || '',
      esMayorista(cliente) ? 'Sí' : 'No',
      cliente.creditLimitPyg ?? '',
      stat.orders,
      stat.totalSpentPyg,
      deudaPorId.get(id) ?? 0,
    ])
  }
  return { encabezados, filas, filtros, nombre: 'mobos-clientes.csv' }
}

/* ── Unidades de inventario ─────────────────────────────────────────── */

const ORDENES_UNIDADES: Record<string, Prisma.Sql> = {
  recientes: Prisma.sql`u."status" ASC, u."updatedAt" DESC`,
  'modelo-az': Prisma.sql`LOWER(p."name") ASC`,
  'modelo-za': Prisma.sql`LOWER(p."name") DESC`,
  nuevos: Prisma.sql`CASE WHEN u."condition" = 'NEW' THEN 0 ELSE 1 END ASC, LOWER(p."name") ASC`,
  semis: Prisma.sql`CASE WHEN u."condition" = 'NEW' THEN 1 ELSE 0 END ASC, LOWER(p."name") ASC`,
  mezclado: Prisma.sql`LOWER(p."name") ASC`,
}

async function exportarUnidades(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  const tenant = session.user.tenantId
  const branchParam = texto(params.get('branchId'))
  const puedeVerSucursal = !['VENDEDOR', 'CAJERA'].includes(session.user.role) || session.user.branchId === branchParam
  if (branchParam && !puedeVerSucursal) throw new ExportError('No autorizado para esa sucursal.', 403)
  const branchId = branchParam || session.user.branchId || ''
  const raw = (texto(params.get('q'))).replace(/^MOBOS:/i, '')
  const query = raw ? serialKey(raw) : ''
  const orden = texto(params.get('orden')) || 'recientes'
  const orderBy = ORDENES_UNIDADES[orden]
  if (!orderBy) throw new ExportError('Orden inválido.', 400)
  const encabezados = ['Producto', 'Capacidad', 'SKU', 'Serial', 'Condición', 'Estado', 'Sucursal', 'Ubicación', 'Proveedor', 'Costo (Gs)']
  const filtros = { q: raw, orden, branchId: branchId || undefined }
  const eventos = await prisma.auditLog.findMany({
    where: { tenantId: tenant, entity: 'InventoryUnit', action: { in: [INVENTORY_REMOVED, INVENTORY_RESTORED] } },
    select: { entityId: true, action: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 5000,
  })
  const removidas = removedInventoryUnitIds(eventos)
  const condiciones: Prisma.Sql[] = [Prisma.sql`u."tenantId" = ${tenant}`, UNIDAD_EN_PANTALLA]
  if (branchId) condiciones.push(Prisma.sql`u."branchId" = ${branchId}`)
  if (removidas.size) condiciones.push(Prisma.sql`u."id" NOT IN (${Prisma.join([...removidas])})`)
  if (query) {
    const patron = `%${query}%`
    condiciones.push(Prisma.sql`(u."serial" ILIKE ${patron} OR p."sku" ILIKE ${patron} OR p."name" ILIKE ${`%${raw}%`})`)
  }
  const unidades = await prisma.$queryRaw<Array<{
    serial: string
    status: string
    condition: string
    costPyg: number | null
    originalCost: Prisma.Decimal | null
    costCurrency: string
    supplierName: string | null
    productName: string
    sku: string | null
    capacity: string | null
    branchName: string | null
    locationName: string | null
  }>>(Prisma.sql`
    SELECT u."serial", u."status", u."condition", u."costPyg", u."originalCost", u."costCurrency", u."supplierName",
           p."name" AS "productName", p."sku", p."capacity",
           b."name" AS "branchName", l."name" AS "locationName"
    FROM "InventoryUnit" u
    JOIN "Product" p ON p."id" = u."productId"
    LEFT JOIN "Branch" b ON b."id" = u."branchId"
    LEFT JOIN "StockLocation" l ON l."id" = u."locationId"
    WHERE ${Prisma.join(condiciones, ' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${MAX_EXPORT_ROWS}`)
  const filas = unidades.map((unidad) => {
    const costo = unidad.costPyg ?? (unidad.costCurrency === 'PYG' && unidad.originalCost !== null ? Number(unidad.originalCost) : '')
    return [
      unidad.productName,
      unidad.capacity || '',
      unidad.sku || '',
      unidad.serial,
      CONDICIONES_UNIDAD[unidad.condition] || unidad.condition,
      ESTADOS_UNIDAD[unidad.status] || unidad.status,
      unidad.branchName || '',
      unidad.locationName || '',
      unidad.supplierName || '',
      costo,
    ]
  })
  return { encabezados, filas, filtros, nombre: 'mobos-inventario-unidades.csv' }
}

/* ── Compras ────────────────────────────────────────────────────────── */

async function exportarCompras(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  if (session.user.role === 'VENDEDOR') throw new ExportError('No autorizado.', 403)
  const tenant = session.user.tenantId
  const branchId = session.user.role === 'ADMIN' ? null : (session.user.branchId || '')
  const encabezados = ['Proveedor', 'Estado', 'Fecha', 'Vencimiento', 'Total', 'Pagado', 'Saldo']
  if (branchId === '') return { encabezados, filas: [], filtros: {}, nombre: 'mobos-compras.csv' }
  const compras = await prisma.$queryRaw<Array<{
    supplierName: string
    status: string
    createdAt: Date
    dueAt: Date | null
    finalCostPyg: bigint
    paidPyg: bigint
  }>>(Prisma.sql`
    SELECT po."supplierName", po."status", po."createdAt", po."dueAt",
           COALESCE((SELECT SUM(pl."finalTotalCostPyg") FROM "PurchaseLine" pl WHERE pl."purchaseId" = po."id"), 0)::bigint AS "finalCostPyg",
           COALESCE((SELECT SUM(pp."amountPyg") FROM "PurchasePayment" pp WHERE pp."purchaseId" = po."id"), 0)::bigint AS "paidPyg"
    FROM "PurchaseOrder" po
    WHERE po."tenantId" = ${tenant}${branchId ? Prisma.sql` AND po."branchId" = ${branchId}` : Prisma.empty}
    ORDER BY po."createdAt" DESC
    LIMIT ${MAX_EXPORT_ROWS}`)
  const filas = compras.map((compra) => {
    const total = Number(compra.finalCostPyg)
    const pagado = Number(compra.paidPyg)
    return [
      compra.supplierName,
      ESTADOS_COMPRA[compra.status] || compra.status,
      fechaCsv(compra.createdAt),
      fechaCsv(compra.dueAt),
      total,
      pagado,
      total - pagado,
    ]
  })
  return { encabezados, filas, filtros: { branchId: branchId ?? undefined }, nombre: 'mobos-compras.csv' }
}

/* ── Movimientos de caja ────────────────────────────────────────────── */

const ROLES_CAJA = ['ADMIN', 'GERENTE', 'CAJERA']

const fechaParam = (value: string | null) => {
  if (!value) return null
  const fecha = new Date(value)
  if (!Number.isFinite(fecha.getTime())) throw new ExportError('Fecha inválida.', 400)
  return fecha
}

async function exportarMovimientos(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  if (!ROLES_CAJA.includes(session.user.role)) throw new ExportError('No autorizado.', 403)
  const tenant = session.user.tenantId
  const requested = texto(params.get('branchId'))
  let branchId: string | null = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
  if (!branchId) branchId = await ensureStoreBranch(session)
  if (!branchId) throw new ExportError('No autorizado.', 403)
  const branch = await prisma.branch.findFirst({ where: { id: branchId, tenantId: tenant, isActive: true }, select: { id: true } })
  if (!branch) throw new ExportError('No autorizado para esa sucursal.', 403)
  const desde = fechaParam(params.get('desde'))
  const hasta = fechaParam(params.get('hasta'))
  const where: Prisma.CashMovementWhereInput = {
    tenantId: tenant,
    // Mismo alcance que /api/cash: el administrador ve todas las sucursales.
    ...(session.user.role === 'ADMIN' ? {} : { branchId }),
    ...(desde || hasta ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
  }
  const movimientos = await prisma.cashMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: MAX_EXPORT_ROWS,
    include: { account: { select: { name: true } } },
  })
  const usuarios = movimientos.length
    ? await prisma.user.findMany({ where: { tenantId: tenant, id: { in: [...new Set(movimientos.map((movimiento) => movimiento.createdById))] } }, select: { id: true, name: true } })
    : []
  const usuarioPorId = new Map(usuarios.map((usuario) => [usuario.id, usuario.name]))
  const encabezados = ['Fecha', 'Tipo', 'Dirección', 'Medio', 'Monto (Gs)', 'Estado', 'Usuario']
  const filas = movimientos.map((movimiento) => [
    movimiento.createdAt.toISOString(),
    TIPOS_MOVIMIENTO[movimiento.kind] || movimiento.kind,
    DIRECCIONES_MOVIMIENTO[movimiento.direction] || movimiento.direction,
    movimiento.account?.name || '',
    movimiento.amountPyg,
    ESTADOS_MOVIMIENTO[movimiento.status] || movimiento.status,
    usuarioPorId.get(movimiento.createdById) || '',
  ])
  return {
    encabezados,
    filas,
    filtros: { branchId, desde: desde?.toISOString(), hasta: hasta?.toISOString() },
    nombre: 'mobos-caja-movimientos.csv',
  }
}

/* ── Garantías ──────────────────────────────────────────────────────── */

async function exportarGarantias(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  if (session.user.role === 'VENDEDOR') throw new ExportError('No autorizado.', 403)
  const tenant = session.user.tenantId
  const q = texto(params.get('q'))
  const kind = texto(params.get('kind')).toUpperCase() === 'COVERAGE' ? 'COVERAGE' : 'SERVICE'
  const branch = session.user.role === 'ADMIN' ? null : session.user.branchId
  const encabezados = ['Cliente', 'Teléfono', 'Serial', 'Caso', 'Estado', 'Garantía', 'Vence']
  const filtros = { q, kind, branchId: branch ?? undefined }
  if (session.user.role !== 'ADMIN' && !branch) return { encabezados, filas: [], filtros, nombre: 'mobos-garantias.csv' }
  const casos = await prisma.$queryRaw<Array<{
    customerName: string
    serial: string
    description: string
    status: string
    coverage: string | null
    warrantyDays: number | null
    expiresAt: Date | null
    customerPhone: string | null
    customerCountryCode: string | null
  }>>(Prisma.sql`
    SELECT w."customerName", w."serial", w."description", w."status", w."coverage", w."warrantyDays", w."expiresAt",
           c."phone" AS "customerPhone", c."countryCode" AS "customerCountryCode"
    FROM "WarrantyCase" w
    LEFT JOIN "OrderItem" oi ON oi."id" = w."orderItemId"
    LEFT JOIN "Order" o ON o."id" = oi."orderId"
    LEFT JOIN "Customer" c ON c."id" = o."customerId"
    WHERE w."tenantId" = ${tenant} AND w."kind"::text = ${kind}
      ${branch ? Prisma.sql`AND w."branchId" = ${branch}` : Prisma.empty}
      AND (${q} = '' OR w."serial" ILIKE ${`%${q}%`} OR w."customerName" ILIKE ${`%${q}%`} OR w."description" ILIKE ${`%${q}%`})
    ORDER BY w."createdAt" DESC
    LIMIT ${MAX_EXPORT_ROWS}`)
  const filas = casos.map((caso) => [
    caso.customerName,
    [caso.customerCountryCode, caso.customerPhone].filter(Boolean).join(' '),
    caso.serial,
    caso.description,
    ESTADOS_GARANTIA[caso.status] || caso.status,
    caso.coverage || (caso.warrantyDays ? `${caso.warrantyDays} días` : ''),
    fechaCsv(caso.expiresAt),
  ])
  return { encabezados, filas, filtros, nombre: 'mobos-garantias.csv' }
}

/* ── Auditoría ──────────────────────────────────────────────────────── */

// Mismos filtros que la pantalla (área, búsqueda, fecha y actor) y etiquetas
// legibles: el archivo se lee sin conocer el backend.
async function exportarAuditoria(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  if (!(ROLES_AUDITORIA as readonly string[]).includes(session.user.role)) throw new ExportError('No autorizado.', 403)
  const parsed = parseFiltrosAuditoria(params)
  if (!parsed.ok) throw new ExportError(parsed.error, 400)
  const filas = (await prisma.auditLog.findMany({
    where: whereAuditoria(session.user.tenantId, parsed.filtros),
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_EXPORT_ROWS,
  })).map((row) => [
    row.createdAt.toISOString(),
    ACCIONES_AUDITORIA[row.action] || row.action,
    row.user?.name || 'Sistema',
    AREAS_AUDITORIA[row.entity] || row.entity,
    row.entityId ? `${row.entity} · ${row.entityId}` : row.entity,
    detalleAuditoria(row.metadata, Number.POSITIVE_INFINITY),
  ])
  return {
    encabezados: ['Fecha', 'Acción', 'Actor', 'Área', 'Entidad/ID', 'Detalle'],
    filas,
    filtros: {
      entity: parsed.filtros.entidades.join(',') || undefined,
      action: parsed.filtros.action || undefined,
      q: parsed.filtros.q || undefined,
      desde: parsed.filtros.desde?.toISOString(),
      hasta: parsed.filtros.hasta?.toISOString(),
      userId: parsed.filtros.userId || undefined,
    },
    nombre: 'mobos-auditoria.csv',
  }
}

/* ── Comisiones ─────────────────────────────────────────────────────── */

async function exportarComisiones(session: SessionContext, params: URLSearchParams): Promise<Exportacion> {
  if (!(REPORT_ROLES as readonly string[]).includes(session.user.role)) throw new ExportError('No autorizado.', 403)
  const tenant = session.user.tenantId
  // El reporte usa from/to; la exportación acepta desde/hasta para hablar el
  // mismo idioma que el resto de los listados.
  const parseParams = new URLSearchParams(params)
  if (parseParams.get('desde')) parseParams.set('from', parseParams.get('desde') || '')
  if (parseParams.get('hasta')) parseParams.set('to', parseParams.get('hasta') || '')
  const parsed = parseReportQuery(parseParams)
  if (!parsed.ok) throw new ExportError(parsed.error, 400)
  const { from, to, offsetMinutes } = parsed.value
  const { start, end } = dayBounds(from, to, offsetMinutes)
  const solicitada = texto(params.get('branchId'))
  let branchId: string | null = null
  if (solicitada) {
    const branch = await prisma.branch.findFirst({ where: { id: solicitada, tenantId: tenant, isActive: true }, select: { id: true } })
    if (!branch) throw new ExportError('Sucursal no encontrada.', 404)
    branchId = branch.id
  }
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant, createdAt: { gte: start, lt: end }, ...(branchId ? { branchId } : {}) },
    include: {
      items: {
        select: {
          productId: true,
          description: true,
          quantity: true,
          unitCostPyg: true,
          totalPyg: true,
          product: { select: { name: true, category: true } },
        },
      },
      seller: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_REPORT_ORDERS + 1,
  })
  const usadas = orders.length > MAX_REPORT_ORDERS ? orders.slice(0, MAX_REPORT_ORDERS) : orders
  const rules = await prisma.commissionRule.findMany({
    where: { tenantId: tenant },
    select: { userId: true, role: true, percentPyg: true },
  })
  const sellers: Record<string, { name: string | null; role: string | null }> = {}
  for (const order of usadas) {
    if (!order.sellerId || sellers[order.sellerId]) continue
    sellers[order.sellerId] = { name: order.seller?.name ?? null, role: order.seller?.role ?? null }
  }
  const commissions = aggregateCommissions(
    usadas.map((orden) => ({
      id: orden.id,
      status: orden.status,
      subtotalPyg: orden.subtotalPyg,
      discountPyg: orden.discountPyg,
      deliveryPyg: orden.deliveryPyg,
      totalPyg: orden.totalPyg,
      sellerId: orden.sellerId,
      sellerName: orden.seller?.name ?? null,
      createdAt: orden.createdAt,
      items: orden.items.map((item) => ({
        productId: item.productId,
        description: item.description,
        productName: item.product?.name ?? null,
        category: item.product?.category ?? null,
        quantity: item.quantity,
        unitCostPyg: item.unitCostPyg,
        totalPyg: item.totalPyg,
      })),
    })),
    rules.map((rule) => ({ userId: rule.userId, role: rule.role, percentPyg: rule.percentPyg === null ? null : Number(rule.percentPyg) })),
    sellers,
  )
  const filas = commissions.sellers.map((row) => [
    row.sellerName || 'Sin vendedor',
    row.orders,
    row.totalPyg,
    row.marginPyg,
    row.commissionPct ?? '',
    row.commissionPyg,
  ])
  return {
    encabezados: ['Vendedor', 'Ventas', 'Total vendido', 'Margen', '% comisión', 'Comisión'],
    filas,
    filtros: { desde: from, hasta: to, branchId: branchId ?? undefined },
    nombre: `mobos-comisiones-${from}-a-${to}.csv`,
  }
}
