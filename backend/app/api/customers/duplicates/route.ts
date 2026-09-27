import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'

// Posible duplicado al crear/editar un cliente (#268): mismo teléfono,
// documento o correo (normalizados). Solo lectura: la UI avisa y deja seguir.
const sinFormato = (value: unknown) => String(value ?? '').replace(/[^\da-z]/gi, '').toLowerCase()
const soloDigitos = (value: unknown) => String(value ?? '').replace(/\D/g, '')

export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  const tenant = session.user.tenantId
  const params = new URL(request.url).searchParams
  const telefono = soloDigitos(params.get('phone') || '').slice(0, 20)
  const documento = sinFormato(params.get('document') || '').slice(0, 30)
  const correo = String(params.get('email') || '').trim().toLowerCase().slice(0, 200)
  const excluir = (params.get('excludeId') || '').trim().slice(0, 128)
  if (!telefono && !documento && !correo) return json({ duplicados: [] })

  const candidatos = await prisma.customer.findMany({
    where: {
      tenantId: tenant,
      archivedAt: null,
      ...(excluir ? { id: { not: excluir } } : {}),
      OR: [
        ...(telefono.length >= 6 ? [{ phone: { contains: telefono.slice(-6) } }] : []),
        ...(documento ? [{ document: { contains: documento.slice(0, 12), mode: 'insensitive' as const } }] : []),
        ...(correo ? [{ email: { equals: correo, mode: 'insensitive' as const } }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, countryCode: true, email: true, document: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 10,
  })

  const duplicados = candidatos.filter((cliente) => {
    const mismosDigitos = telefono && soloDigitos(cliente.phone) === telefono
    const mismoDocumento = documento && sinFormato(cliente.document) === documento
    const mismoCorreo = correo && String(cliente.email || '').trim().toLowerCase() === correo
    return Boolean(mismosDigitos || mismoDocumento || mismoCorreo)
  }).map(({ createdAt, ...cliente }) => ({ ...cliente, createdAt }))
  return json({ duplicados })
}
