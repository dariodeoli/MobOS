import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { cashBreakdownRows, cashDifferencePyg } from '../../../../../lib/cash-shift'

// Verificación pública de un cierre de caja por su token (el QR del comprobante
// impreso). Devuelve solo lo mínimo para contrastar el papel: sucursal, turno,
// quién abrió/cerró, esperado/contado/diferencia y el arqueo por denominación.
// Nunca expone ventas, clientes, movimientos ni notas internas.
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const clean = typeof token === 'string' ? token.trim() : ''
  if (!clean || clean.length > 200) return error('Cierre de caja no encontrado.', 404)
  const session = await prisma.cashSession.findUnique({
    where: { publicToken: clean },
    select: {
      status: true,
      openedAt: true,
      closedAt: true,
      openingPyg: true,
      expectedPyg: true,
      countedPyg: true,
      countedBreakdown: true,
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      branch: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  })
  if (!session) return error('Cierre de caja no encontrado.', 404)
  const breakdown = session.countedBreakdown as Record<string, number> | null
  return json({
    empresa: session.tenant?.name ?? null,
    sucursal: session.branch?.name ?? null,
    estado: session.status,
    abiertoEn: session.openedAt,
    cerradoEn: session.closedAt,
    abiertoPor: session.openedBy?.name ?? null,
    cerradoPor: session.closedBy?.name ?? null,
    aperturaPyg: session.openingPyg,
    esperadoPyg: session.expectedPyg,
    contadoPyg: session.countedPyg,
    diferenciaPyg:
      session.countedPyg == null || session.expectedPyg == null
        ? null
        : cashDifferencePyg(session.countedPyg, session.expectedPyg),
    arqueo: cashBreakdownRows(breakdown),
    verificado: true,
  })
}
