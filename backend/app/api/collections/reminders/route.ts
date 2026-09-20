import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { internationalPhone } from '../../../../lib/validation'
import {
  DIA_MS,
  FALLBACK_CUOTA_POR_VENCER,
  FALLBACK_CUOTA_VENCIDA,
  calcularRecargoPyg,
  diasDeAtraso,
  esCuotaVencida,
  plantillaDeCobranza,
  renderPlantilla,
  variablesDeCuota,
} from '../../../../lib/collections'

// Cobranzas por WhatsApp: cuotas a crédito vencidas y próximas, con mora
// explícita y un enlace wa.me por cuota. El aviso es una acción humana (abrir
// el enlace), así que se marca recién al generar el recordatorio y queda
// auditado en la cronología del cliente y del pedido. Los flags del email
// (remindedAt/overdueRemindedAt) no se tocan: cada canal avisa una vez.
const ROLES = ['ADMIN', 'GERENTE', 'CAJERA']
const VENTANA_DIAS_DEFAULT = 7
const VENTANA_DIAS_MAX = 60
const DIAS_MS = DIA_MS

type FilaCuota = {
  id: string
  tenantId: string
  amountPyg: number
  reference: string | null
  dueAt: Date | null
  whatsappRemindedAt: Date | null
  whatsappOverdueRemindedAt: Date | null
  order: {
    id: string
    orderNumber: string | null
    dueAt: Date | null
    customer: { id: string; name: string | null; phone: string | null; countryCode: string | null } | null
  }
}

function fechaDeCuota(cuota: Pick<FilaCuota, 'dueAt' | 'order'>): Date | null {
  return cuota.dueAt ?? cuota.order?.dueAt ?? null
}

async function contexto(request: Request) {
  const session = await requireSession(request)
  if (!session) return { error: error('Falta sesión.', 401) }
  if (!ROLES.includes(session.user.role)) return { error: error('No autorizado.', 403) }
  return { session }
}

async function datosDeAviso(tenantId: string) {
  const [tenant, plantillas] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, collectionLateFeeBpPerDay: true } }),
    prisma.messageTemplate.findMany({ where: { tenantId, category: 'COLLECTIONS' }, select: { key: true, body: true, isActive: true, isDefault: true } }),
  ])
  return { tenantName: tenant?.name?.trim() || 'la tienda', moraBpPorDia: tenant?.collectionLateFeeBpPerDay ?? 0, plantillas }
}

function armarCuota(cuota: FilaCuota, input: { now: Date; moraBpPorDia: number; tenantName: string; plantillas: Array<{ key: string; body: string; isActive: boolean; isDefault: boolean }> }) {
  const dueAt = fechaDeCuota(cuota)
  if (!dueAt) return null
  const vencida = esCuotaVencida(dueAt, input.now)
  const diasAtraso = diasDeAtraso(dueAt, input.now)
  const recargoPyg = vencida ? calcularRecargoPyg({ amountPyg: cuota.amountPyg, diasAtraso, bpPorDia: input.moraBpPorDia }) : 0
  const { key, body } = plantillaDeCobranza(input.plantillas, vencida ? FALLBACK_CUOTA_VENCIDA : FALLBACK_CUOTA_POR_VENCER, vencida)
  const variables = variablesDeCuota({
    cliente: cuota.order?.customer?.name || 'cliente',
    pedido: cuota.order?.orderNumber || '',
    vencimiento: dueAt.toLocaleDateString('es-PY'),
    saldoPendiente: cuota.amountPyg,
    diasAtraso,
    recargoPyg,
    empresa: input.tenantName,
    sucursal: input.tenantName,
  })
  const texto = renderPlantilla(body, variables).trim()
  // El recargo se agrega al final solo si la plantilla no lo menciona: así una
  // tienda sin tasa configurada nunca anuncia un recargo que no existe.
  const mensaje = recargoPyg > 0 && !body.includes('{{recargo}}') ? `${texto} Recargo por mora: Gs. ${Number(recargoPyg).toLocaleString('es-PY')}.` : texto
  const numero = internationalPhone(cuota.order?.customer?.phone, cuota.order?.customer?.countryCode)
  const avisadoEn = vencida ? cuota.whatsappOverdueRemindedAt : cuota.whatsappRemindedAt
  return {
    id: cuota.id,
    orderId: cuota.order?.id ?? null,
    orderNumber: cuota.order?.orderNumber ?? null,
    customerId: cuota.order?.customer?.id ?? null,
    customerName: cuota.order?.customer?.name ?? null,
    phone: cuota.order?.customer?.phone ?? null,
    tipo: vencida ? 'VENCIDA' : 'PROXIMA',
    saldoPendientePyg: cuota.amountPyg,
    recargoPyg,
    totalPyg: cuota.amountPyg + recargoPyg,
    reference: cuota.reference,
    dueAt: dueAt.toISOString(),
    diasAtraso,
    templateKey: key,
    message: mensaje,
    whatsappUrl: numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null,
    avisadoEn: avisadoEn ? avisadoEn.toISOString() : null,
  }
}

// Cuotas por recordar: vencidas primero (más atrasadas arriba) y luego las que
// vencen dentro de la ventana. `kind=due|overdue` filtra un solo grupo.
export async function GET(request: Request) {
  const { session, error: denied } = await contexto(request)
  if (denied || !session) return denied
  const tenantId = session.user.tenantId
  const params = new URL(request.url).searchParams
  const kind = params.get('kind') || 'all'
  if (!['all', 'due', 'overdue'].includes(kind)) return error('Tipo de recordatorio inválido.')
  const ventanaDias = Math.min(VENTANA_DIAS_MAX, Math.max(0, Number(params.get('days')) || VENTANA_DIAS_DEFAULT))
  const now = new Date()
  const cuotas = await prisma.payment.findMany({
    where: {
      tenantId,
      status: 'PENDING',
      method: 'CREDIT',
      OR: [
        { dueAt: { lte: new Date(now.getTime() + ventanaDias * DIAS_MS) } },
        { dueAt: null, order: { dueAt: { lte: new Date(now.getTime() + ventanaDias * DIAS_MS) } } },
      ],
    },
    select: {
      id: true, tenantId: true, amountPyg: true, reference: true, dueAt: true,
      whatsappRemindedAt: true, whatsappOverdueRemindedAt: true,
      order: { select: { id: true, orderNumber: true, dueAt: true, customer: { select: { id: true, name: true, phone: true, countryCode: true } } } },
    },
    orderBy: { dueAt: 'asc' },
    take: 500,
  })
  const { tenantName, moraBpPorDia, plantillas } = await datosDeAviso(tenantId)
  const rows = cuotas
    .map((cuota) => armarCuota(cuota, { now, moraBpPorDia, tenantName, plantillas }))
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .filter((row) => (kind === 'overdue' ? row.tipo === 'VENCIDA' : kind === 'due' ? row.tipo === 'PROXIMA' : true))
    .sort((a, b) => (a.tipo === b.tipo ? new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() : a.tipo === 'VENCIDA' ? -1 : 1))
  return json({ generadoEn: now.toISOString(), moraBpPorDia, ventanaDias, total: rows.length, rows })
}

// Marca el aviso de una cuota (idempotente: la segunda vez responde 409 salvo
// `force`). `kind` lo define el servidor según el vencimiento real.
export async function POST(request: Request) {
  const { session, error: denied } = await contexto(request)
  if (denied || !session) return denied
  const tenantId = session.user.tenantId
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : ''
  if (!paymentId) return error('Elegí la cuota a recordar.')
  const force = body.force === true
  const cuota = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId, status: 'PENDING', method: 'CREDIT' },
    select: {
      id: true, tenantId: true, amountPyg: true, reference: true, dueAt: true,
      whatsappRemindedAt: true, whatsappOverdueRemindedAt: true,
      order: { select: { id: true, orderNumber: true, dueAt: true, customer: { select: { id: true, name: true, phone: true, countryCode: true } } } },
    },
  })
  if (!cuota) return error('Cuota no encontrada o ya cobrada.', 404)
  const { tenantName, moraBpPorDia, plantillas } = await datosDeAviso(tenantId)
  const now = new Date()
  const row = armarCuota(cuota as FilaCuota, { now, moraBpPorDia, tenantName, plantillas })
  if (!row) return error('La cuota no tiene vencimiento cargado.', 409)
  if (!row.whatsappUrl) return error('El cliente no tiene teléfono cargado.', 409)
  if (row.avisadoEn && !force) return error('Esta cuota ya fue recordada por WhatsApp.', 409, { avisadoEn: row.avisadoEn })
  const vencida = row.tipo === 'VENCIDA'
  const marked = await prisma.$transaction(async tx => {
    // Sin `force` la marca es atómica y no pisa un aviso previo; con `force` se
    // permite el reenvío explícito (queda auditado como tal).
    const updated = vencida
      ? await tx.payment.updateMany({ where: { id: cuota.id, tenantId, ...(force ? {} : { whatsappOverdueRemindedAt: null }) }, data: { whatsappOverdueRemindedAt: now } })
      : await tx.payment.updateMany({ where: { id: cuota.id, tenantId, ...(force ? {} : { whatsappRemindedAt: null }) }, data: { whatsappRemindedAt: now } })
    if (!updated.count) return null
    const metadata = {
      paymentId: cuota.id,
      orderId: cuota.order?.id ?? null,
      orderNumber: cuota.order?.orderNumber ?? null,
      tipo: row.tipo,
      diasAtraso: row.diasAtraso,
      saldoPendientePyg: row.saldoPendientePyg,
      recargoPyg: row.recargoPyg,
      templateKey: row.templateKey,
      reenvio: Boolean(row.avisadoEn && force),
    }
    // Doble registro a propósito: el pedido lo muestra en su cronología y el
    // cliente en la suya (mismo hecho, dos vistas).
    if (cuota.order?.id) {
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'ORDER_COLLECTION_WHATSAPP_REMINDED', entity: 'Order', entityId: cuota.order.id, metadata } })
    }
    if (cuota.order?.customer?.id) {
      await tx.auditLog.create({ data: { tenantId, userId: session.user.id, action: 'COLLECTION_WHATSAPP_REMINDED', entity: 'Customer', entityId: cuota.order.customer.id, metadata } })
    }
    return now
  })
  if (!marked) return error('Esta cuota ya fue recordada por WhatsApp.', 409)
  return json({ ok: true, recordadoEn: marked.toISOString(), ...row, avisadoEn: marked.toISOString() })
}
