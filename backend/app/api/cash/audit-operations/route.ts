import { prisma } from '../../../../lib/prisma'
import { requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'
import { ensureStoreBranch } from '../../../../lib/store-branch'
import { InputError, objectInput, textInput } from '../../../../lib/payment-input'

// Auditoría de efectivo (#161): lista las operaciones de caja de un rango
// (cobros en efectivo y movimientos) con su marca de verificación, y permite
// marcarlas verificadas / pendientes / con diferencia con una observación.
// Cada marca queda auditada con el usuario real.

const ROLES = ['ADMIN', 'GERENTE', 'CAJERA']
const KINDS = ['PAYMENT', 'MOVEMENT']
const STATUSES = ['VERIFIED', 'PENDING', 'DIFFERENCE']
// Paraguay opera en UTC-3 fijo (mismo criterio que el resto de Finanzas): el
// día operativo de la sucursal se delimita así.
const OFFSET = '-03:00'
const MAX_DIAS = 366

function rangoDe(params: URLSearchParams) {
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new InputError('Indicá el rango con desde y hasta (YYYY-MM-DD).')
  const start = new Date(`${from}T00:00:00${OFFSET}`)
  const end = new Date(`${to}T00:00:00${OFFSET}`)
  end.setDate(end.getDate() + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new InputError('El rango de fechas es inválido.')
  if (end.getTime() - start.getTime() > MAX_DIAS * 86_400_000) throw new InputError(`El rango no puede superar ${MAX_DIAS} días.`)
  return { from, to, start, end }
}

export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!ROLES.includes(session.user.role)) return error('No autorizado.', 403)
  try {
    const params = new URL(request.url).searchParams
    const { from, to, start, end } = rangoDe(params)
    const requested = params.get('branchId')
    let branchId: string | null = session.user.branchId || (session.user.role === 'ADMIN' ? requested : null)
    if (!branchId) branchId = await ensureStoreBranch(session)
    if (!branchId) return error('Sucursal no encontrada.', 403)

    const [sesiones, cobros, movimientos] = await Promise.all([
      prisma.cashSession.findMany({
        where: { tenantId: tenant, branchId, OR: [{ openedAt: { gte: start, lt: end } }, { closedAt: { gte: start, lt: end } }] },
        select: { id: true, openedAt: true, closedAt: true, openingPyg: true, countedPyg: true, expectedPyg: true, status: true, openedBy: { select: { name: true } }, closedBy: { select: { name: true } } },
        orderBy: { openedAt: 'desc' },
      }),
      prisma.payment.findMany({
        where: { tenantId: tenant, method: 'CASH', status: 'CONFIRMED', paidAt: { gte: start, lt: end }, order: { branchId } },
        select: {
          id: true, amountPyg: true, paidAt: true, reference: true,
          order: { select: { orderNumber: true, customer: { select: { name: true } }, seller: { select: { name: true } } } },
          createdBy: { select: { name: true } },
        },
        orderBy: { paidAt: 'desc' },
        take: 2000,
      }),
      prisma.cashMovement.findMany({
        where: { tenantId: tenant, branchId, createdAt: { gte: start, lt: end } },
        select: { id: true, kind: true, direction: true, amountPyg: true, description: true, counterparty: true, reference: true, status: true, createdAt: true, createdById: true },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ])

    const usuarios = movimientos.length
      ? await prisma.user.findMany({ where: { id: { in: [...new Set(movimientos.map((movimiento) => movimiento.createdById))] } }, select: { id: true, name: true } })
      : []
    const nombreUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.name]))

    const marcas = await prisma.cashAuditMark.findMany({
      where: { tenantId: tenant, OR: [{ operationKind: 'PAYMENT', operationId: { in: cobros.map((cobro) => cobro.id) } }, { operationKind: 'MOVEMENT', operationId: { in: movimientos.map((movimiento) => movimiento.id) } }] },
      select: { operationKind: true, operationId: true, status: true, note: true, auditedAt: true, auditedBy: { select: { name: true } } },
    })
    const marcaDe = new Map(marcas.map((marca) => [`${marca.operationKind}:${marca.operationId}`, marca]))

    const operaciones = [
      ...cobros.map((cobro) => ({
        id: cobro.id, kind: 'PAYMENT', fecha: cobro.paidAt, direction: 'IN', montoPyg: cobro.amountPyg,
        pedido: cobro.order?.orderNumber || '', cliente: cobro.order?.customer?.name || '', vendedor: cobro.order?.seller?.name || cobro.createdBy?.name || '',
        nota: cobro.reference || '',
      })),
      ...movimientos.map((movimiento) => ({
        id: movimiento.id, kind: 'MOVEMENT', fecha: movimiento.createdAt, direction: movimiento.direction, montoPyg: movimiento.amountPyg,
        pedido: '', cliente: movimiento.counterparty || '', vendedor: nombreUsuario.get(movimiento.createdById) || '',
        nota: [movimiento.description, movimiento.reference].filter(Boolean).join(' · '),
      })),
    ].map((operacion) => {
      const marca = marcaDe.get(`${operacion.kind}:${operacion.id}`)
      return { ...operacion, status: marca?.status || 'PENDING', notaAuditoria: marca?.note || '', auditadoPor: marca?.auditedBy?.name || '', auditadoAt: marca?.auditedAt || null }
    }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    const aperturaPyg = sesiones.reduce((suma, sesion) => suma + sesion.openingPyg, 0)
    const esperadoPyg = sesiones.reduce((suma, sesion) => suma + Number(sesion.expectedPyg || 0), 0)
    const diferenciaPyg = sesiones.reduce((suma, sesion) => suma + (sesion.countedPyg === null ? 0 : Number(sesion.countedPyg) - Number(sesion.expectedPyg || 0)), 0)
    const recibidoPyg = operaciones.filter((operacion) => operacion.direction === 'IN').reduce((suma, operacion) => suma + operacion.montoPyg, 0)
    return json({
      rango: { from, to, branchId },
      resumen: {
        aperturaPyg,
        esperadoPyg,
        diferenciaPyg,
        recibidoPyg,
        operaciones: operaciones.length,
        verificadas: operaciones.filter((operacion) => operacion.status === 'VERIFIED').length,
        pendientes: operaciones.filter((operacion) => operacion.status === 'PENDING').length,
        conDiferencia: operaciones.filter((operacion) => operacion.status === 'DIFFERENCE').length,
      },
      sesiones: sesiones.map((sesion) => ({ ...sesion, esperadoPyg: sesion.expectedPyg, diferenciaPyg: sesion.countedPyg === null ? null : Number(sesion.countedPyg) - Number(sesion.expectedPyg || 0) })),
      operaciones,
    })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo cargar la auditoría.', e instanceof InputError ? e.status : 400)
  }
}

export async function POST(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!ROLES.includes(session.user.role)) return error('No autorizado.', 403)
  try {
    const body = objectInput(await request.json())
    const operationKind = textInput(body.operationKind, 'operationKind', 20)
    if (!KINDS.includes(operationKind)) throw new InputError('Tipo de operación inválido.')
    const operationId = textInput(body.operationId, 'operationId', 200)
    const status = textInput(body.status, 'status', 20)
    if (!STATUSES.includes(status)) throw new InputError('Estado de auditoría inválido.')
    const note = body.note === undefined || body.note === null || body.note === '' ? null : textInput(body.note, 'note', 500)
    if (status === 'DIFFERENCE' && !note) throw new InputError('Una diferencia necesita una observación.')

    // La operación tiene que existir en la empresa.
    if (operationKind === 'PAYMENT') {
      const pago = await prisma.payment.findFirst({ where: { id: operationId, tenantId: tenant }, select: { id: true } })
      if (!pago) throw new InputError('El cobro no existe en la empresa.', 404)
    } else {
      const movimiento = await prisma.cashMovement.findFirst({ where: { id: operationId, tenantId: tenant }, select: { id: true } })
      if (!movimiento) throw new InputError('El movimiento no existe en la empresa.', 404)
    }

    const marca = await prisma.$transaction(async tx => {
      const guardada = await tx.cashAuditMark.upsert({
        where: { tenantId_operationKind_operationId: { tenantId: tenant, operationKind, operationId } },
        create: { tenantId: tenant, operationKind, operationId, status: status as 'VERIFIED' | 'PENDING' | 'DIFFERENCE', note, auditedById: session.user.id },
        update: { status: status as 'VERIFIED' | 'PENDING' | 'DIFFERENCE', note, auditedById: session.user.id, auditedAt: new Date() },
      })
      await tx.auditLog.create({ data: { tenantId: tenant, userId: session.user.id, action: 'CASH_AUDIT_MARKED', entity: 'CashAuditMark', entityId: guardada.id, metadata: { operationKind, operationId, status, note } } })
      return guardada
    })
    return json({ ...marca, auditadoPor: session.user.name }, { status: 200 })
  } catch (e) {
    return error(e instanceof Error ? e.message : 'No se pudo guardar la auditoría.', e instanceof InputError ? e.status : e instanceof SyntaxError ? 400 : 409)
  }
}
