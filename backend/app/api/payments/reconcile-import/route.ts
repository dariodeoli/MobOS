import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { InputError, INT_MAX, objectInput } from '../../../../lib/payment-input'

// Conciliación bancaria por CSV: el cliente ya parseó el extracto y acá se
// cruzan las filas contra los cobros confirmados del tenant. No modifica nada:
// solo sugiere coincidencias; la confirmación sigue usando el PATCH existente
// de /api/payments/[paymentId]/reconciliation.

const MAX_FILAS = 500
const MAX_COINCIDENCIAS = 5
const DIAS_VENTANA = 3
const DIA_MS = 86400000
// Paraguay opera en UTC-3: la fecha del extracto se interpreta como día local.
const OFFSET_PY_MS = 180 * 60000
const MAX_TEXTO = 300

type FilaExtracto = {
  date: string
  dayNumber: number
  amountPyg: number
  reference: string | null
  description: string | null
}

type PagoCandidato = {
  id: string
  orderId: string
  amountPyg: number
  paidAt: Date
  reference: string | null
  order: { orderNumber: string; customer: { name: string } | null }
  reconciliation: { state: string } | null
}

function textoOpcional(value: unknown, campo: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > MAX_TEXTO) throw new InputError(`${campo} debe ser texto de hasta ${MAX_TEXTO} caracteres.`)
  return value.trim() || null
}

function fechaDeFila(value: unknown): { date: string; dayNumber: number } {
  const texto = typeof value === 'string' ? value.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new InputError('date debe tener formato YYYY-MM-DD.')
  const [anio, mes, dia] = texto.split('-').map(Number)
  const utc = Date.UTC(anio, mes - 1, dia)
  const parsed = new Date(utc)
  if (parsed.getUTCFullYear() !== anio || parsed.getUTCMonth() !== mes - 1 || parsed.getUTCDate() !== dia) throw new InputError(`date inválida: ${texto}.`)
  return { date: texto, dayNumber: utc / DIA_MS }
}

function montoDeFila(value: unknown): number {
  const amountPyg = Number(value)
  if (!Number.isSafeInteger(amountPyg) || amountPyg <= 0 || amountPyg > INT_MAX) throw new InputError('amountPyg debe ser un entero positivo.')
  return amountPyg
}

function filasDelExtracto(value: unknown): FilaExtracto[] {
  if (!Array.isArray(value) || value.length === 0) throw new InputError('rows debe ser un arreglo con al menos una fila.')
  if (value.length > MAX_FILAS) throw new InputError(`rows no puede superar las ${MAX_FILAS} filas.`)
  return value.map((item, index) => {
    try {
      const fila = objectInput(item)
      const fecha = fechaDeFila(fila.date)
      return {
        date: fecha.date,
        dayNumber: fecha.dayNumber,
        amountPyg: montoDeFila(fila.amountPyg),
        reference: textoOpcional(fila.reference, 'reference'),
        description: textoOpcional(fila.description, 'description'),
      }
    } catch (cause) {
      if (cause instanceof InputError) throw new InputError(`Fila ${index + 1}: ${cause.message}`)
      throw new InputError(`Fila ${index + 1}: inválida.`)
    }
  })
}

function normalizarReferencia(value: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Puntaje 0-100: el monto exacto ya está garantizado por el filtro, la fecha
// suma según cercanía y la referencia del pago o del pedido suma cuando
// aparece en la referencia o descripción de la fila.
function puntajeDeCoincidencia(pago: PagoCandidato, fila: FilaExtracto): number | null {
  const diaPago = Math.floor((pago.paidAt.getTime() - OFFSET_PY_MS) / DIA_MS)
  const diferencia = Math.abs(diaPago - fila.dayNumber)
  if (diferencia > DIAS_VENTANA) return null
  let puntaje = 60 + [25, 20, 15, 10][diferencia]
  const texto = normalizarReferencia([fila.reference, fila.description].filter(Boolean).join(' '))
  const agujas = [pago.reference, pago.order.orderNumber].map(normalizarReferencia).filter(aguja => aguja.length >= 4)
  if (texto && agujas.some(aguja => texto.includes(aguja))) puntaje += 15
  return Math.min(puntaje, 100)
}

export async function POST(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, ['payments:manage', 'cash:manage'])) return error('No autorizado para importar extractos.', 403)
  const limited = enforceRateLimit(request, 'payments-reconcile-import', 20, 60_000)
  if (limited) return limited

  let filas: FilaExtracto[]
  try {
    const body = objectInput(await request.json())
    filas = filasDelExtracto(body.rows)
  } catch (cause) {
    if (cause instanceof InputError) return error(cause.message, cause.status)
    if (cause instanceof SyntaxError) return error('JSON inválido.')
    return error('No se pudo leer el extracto.')
  }

  const tenant = session.user.tenantId
  const dias = filas.map(fila => fila.dayNumber * DIA_MS)
  const desde = new Date(Math.min(...dias) - DIAS_VENTANA * DIA_MS + OFFSET_PY_MS)
  const hasta = new Date(Math.max(...dias) + (DIAS_VENTANA + 1) * DIA_MS + OFFSET_PY_MS)
  // La cajera solo ve los cobros de su sucursal, igual que al conciliar a mano.
  const soloSucursal = session.user.role === 'CAJERA' || session.user.role === 'VENDEDOR'

  const candidatos = await prisma.payment.findMany({
    where: {
      tenantId: tenant,
      status: 'CONFIRMED',
      amountPyg: { in: [...new Set(filas.map(fila => fila.amountPyg))] },
      paidAt: { gte: desde, lt: hasta },
      OR: [{ reconciliation: null }, { reconciliation: { is: { state: { not: 'VERIFIED' } } } }],
      ...(soloSucursal ? { order: { branchId: session.user.branchId } } : {}),
    },
    select: {
      id: true,
      orderId: true,
      amountPyg: true,
      paidAt: true,
      reference: true,
      order: { select: { orderNumber: true, customer: { select: { name: true } } } },
      reconciliation: { select: { state: true } },
    },
  })

  const porMonto = new Map<number, PagoCandidato[]>()
  for (const pago of candidatos) {
    const lista = porMonto.get(pago.amountPyg)
    if (lista) lista.push(pago)
    else porMonto.set(pago.amountPyg, [pago])
  }

  const resultado = filas.map(fila => ({
    row: { date: fila.date, amountPyg: fila.amountPyg, reference: fila.reference, description: fila.description },
    matches: (porMonto.get(fila.amountPyg) || [])
      .flatMap(pago => {
        const matchingScore = puntajeDeCoincidencia(pago, fila)
        return matchingScore === null ? [] : [{ pago, matchingScore }]
      })
      .sort((a, b) => b.matchingScore - a.matchingScore || b.pago.paidAt.getTime() - a.pago.paidAt.getTime())
      .slice(0, MAX_COINCIDENCIAS)
      .map(({ pago, matchingScore }) => ({
        paymentId: pago.id,
        orderId: pago.orderId,
        orderNumber: pago.order.orderNumber,
        amountPyg: pago.amountPyg,
        paidAt: pago.paidAt,
        customerName: pago.order.customer?.name ?? null,
        reference: pago.reference,
        matchingScore,
        alreadyReconciled: Boolean(pago.reconciliation),
      })),
  }))

  const conCoincidencia = resultado.filter(fila => fila.matches.length > 0).length
  const resumen = {
    filas: resultado.length,
    conCoincidencia,
    sinCoincidencia: resultado.length - conCoincidencia,
    ambiguas: resultado.filter(fila => fila.matches.length > 1).length,
  }
  const fechas = filas.map(fila => fila.date).sort()
  await prisma.auditLog.create({
    data: {
      tenantId: tenant,
      userId: session.user.id,
      action: 'BANK_STATEMENT_IMPORTED',
      entity: 'Payment',
      metadata: { ...resumen, desde: fechas[0], hasta: fechas[fechas.length - 1] },
    },
  })

  return json({ filas: resultado, resumen })
}
