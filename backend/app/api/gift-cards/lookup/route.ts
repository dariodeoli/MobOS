import { prisma } from '../../../../lib/prisma'
import { canAccessAny, requireSession } from '../../../../lib/auth'
import { error, json, tenantId } from '../../../../lib/http'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { codigoGiftCardValido, hashCodigoGiftCard } from '../../../../lib/gift-card-code'
import { numero } from '../../../../lib/montos'

const PERMISOS = ['pos:use', 'payments:manage', 'orders:manage', 'orders:own', 'orders:branch']

// Consulta de saldo por código (POS): valida el formato antes de tocar la base
// y devuelve solo lo necesario para aplicar el canje. El vencimiento se compara
// con el reloj de Postgres, igual que en el canje (docs/TOKENS.md).
export async function GET(request: Request) {
  const tenant = await tenantId(request); const session = await requireSession(request)
  if (!tenant || !session) return error('Falta sesión.', 401)
  if (!canAccessAny(session.user, PERMISOS)) return error('No autorizado.', 403)
  const limited = enforceRateLimit(request, 'gift-card-lookup', 30, 60_000)
  if (limited) return limited
  const codigo = codigoGiftCardValido(new URL(request.url).searchParams.get('code'))
  if (!codigo) return error('El código de gift card no es válido.', 400)
  const rows = await prisma.$queryRaw<Array<{
    id: string; codeLast4: string; balancePyg: bigint; status: string; expirada: boolean;
    expiresAt: Date | null; customerName: string | null
  }>>`
    SELECT g."id", g."codeLast4", g."balancePyg", g."status"::text AS "status",
           (g."expiresAt" IS NOT NULL AND g."expiresAt" <= now()) AS "expirada",
           g."expiresAt", c."name" AS "customerName"
    FROM "GiftCard" g
    LEFT JOIN "Customer" c ON c."id" = g."customerId"
    WHERE g."tenantId" = ${tenant} AND g."codeHash" = ${hashCodigoGiftCard(codigo)}
    LIMIT 1`
  const tarjeta = rows[0]
  if (!tarjeta) return error('No encontramos una gift card con ese código.', 404)
  return json({
    id: tarjeta.id,
    codeLast4: tarjeta.codeLast4,
    balancePyg: numero(tarjeta.balancePyg),
    status: tarjeta.expirada ? 'EXPIRED' : tarjeta.status,
    expiresAt: tarjeta.expiresAt,
    customerName: tarjeta.customerName,
  })
}
