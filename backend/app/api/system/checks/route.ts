import { prisma } from '../../../../lib/prisma'
import { error, json } from '../../../../lib/http'
import { requireSession } from '../../../../lib/auth'
import { emailTransportConfigured } from '../../../../lib/email'
import { emailOutboxEncryptionConfigured } from '../../../../lib/email-outbox-crypto'
import { aexConfigurado, aexWebhookConToken } from '../../../../lib/aex'

type EstadoChequeo = 'ok' | 'atencion' | 'error'
type Chequeo = { id: string; label: string; estado: EstadoChequeo; detalle: string }

const fecha = (valor: Date) => new Date(valor).toLocaleDateString('es-PY')

// Estado del sistema (solo el dueño): los chequeos que se corren antes de
// entregar una versión, dentro de la app, para detectar configuraciones
// faltantes sin mirar los registros del servidor.
export async function GET(request: Request) {
  const session = await requireSession(request)
  if (!session) return error('Falta sesión.', 401)
  if (session.user.role !== 'ADMIN') return error('Solo el dueño puede ver el estado del sistema.', 403)
  const tenantId = session.user.tenantId
  const chequeos: Chequeo[] = []
  const agregar = (id: string, label: string, estado: EstadoChequeo, detalle: string) => {
    chequeos.push({ id, label, estado, detalle })
  }

  agregar('api', 'API', 'ok', `En línea desde ${new Date().toLocaleString('es-PY')}`)

  try {
    await prisma.$queryRaw`SELECT 1`
    agregar('base', 'Base de datos', 'ok', 'Responde a consultas')
  } catch {
    agregar('base', 'Base de datos', 'error', 'No responde')
  }

  try {
    const filas = await prisma.$queryRaw<{ total: number; ultima: Date | null }[]>`
      SELECT count(*)::int AS total, max(finished_at) AS ultima
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
    `
    const total = Number(filas?.[0]?.total || 0)
    const ultima = filas?.[0]?.ultima ? fecha(filas[0].ultima) : '—'
    agregar('migraciones', 'Migraciones', total > 0 ? 'ok' : 'error', total > 0 ? `${total} aplicadas · última ${ultima}` : 'Sin migraciones aplicadas')
  } catch {
    agregar('migraciones', 'Migraciones', 'atencion', 'No se pudo leer el historial')
  }

  const correo = emailTransportConfigured()
  agregar('correo', 'Correo saliente', correo ? 'ok' : 'atencion', correo ? 'Transporte configurado' : 'Sin configurar: no se envían verificaciones ni avisos')
  const cifrado = emailOutboxEncryptionConfigured()
  agregar('correo-cifrado', 'Cifrado del correo', cifrado ? 'ok' : 'atencion', cifrado ? 'Bandeja de salida cifrada' : 'Sin clave de cifrado')
  const aex = aexConfigurado()
  agregar('aex', 'AEX (envíos)', aex ? 'ok' : 'atencion', aex ? 'Credenciales cargadas' : 'Sin credenciales: cotizador y guías deshabilitados')
  const webhook = aexWebhookConToken()
  agregar('aex-webhook', 'Webhook de AEX', webhook ? 'ok' : 'atencion', webhook ? 'Token acordado' : 'Sin token: el endpoint acepta cualquier origen')

  try {
    const [sucursales, usuarios, duenos] = await Promise.all([
      prisma.branch.count({ where: { tenantId, isActive: true } }),
      prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.user.count({ where: { tenantId, role: 'ADMIN', status: 'ACTIVE' } }),
    ])
    agregar('sucursales', 'Sucursales', sucursales > 0 ? 'ok' : 'error', `${sucursales} activas`)
    agregar('equipo', 'Equipo', usuarios > 0 ? 'ok' : 'error', `${usuarios} usuarios activos · ${duenos} dueño(s)`)
  } catch {
    agregar('datos', 'Datos de la empresa', 'atencion', 'No se pudieron contar')
  }

  const commit = String(process.env.SOURCE_COMMIT || process.env.MOBOS_BUILD || '').trim().slice(0, 7)
  agregar('version', 'Versión desplegada', 'ok', commit ? `Commit ${commit}` : 'Sin identificador de build')

  const resumen = {
    ok: chequeos.filter((chequeo) => chequeo.estado === 'ok').length,
    atencion: chequeos.filter((chequeo) => chequeo.estado === 'atencion').length,
    error: chequeos.filter((chequeo) => chequeo.estado === 'error').length,
  }
  return json({ checkedAt: new Date().toISOString(), resumen, checks: chequeos })
}
