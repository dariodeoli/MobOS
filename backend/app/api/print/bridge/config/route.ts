import { error, json } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'
import { autenticarPuente, remoteEnabledDeTenant } from '../../../../../lib/print-bridge'

const LAN_CUPS_POR_DEFECTO = 'MobOS_LAN'

function lanCupsDeTenant(settings: unknown): string {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return LAN_CUPS_POR_DEFECTO
  const valor = (settings as Record<string, unknown>).printLanCups
  return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, 80) : LAN_CUPS_POR_DEFECTO
}

// Configuración que el puente aprende sin navegador abierto: impresoras activas
// asignadas a él (o sin puente), la predeterminada, la allow-list LAN y la cola
// CUPS de respaldo. Con el modo remoto apagado devuelve configuración vacía.
export async function GET(request: Request) {
  const puente = await autenticarPuente(request, prisma)
  if (!puente) return error('Token de puente inválido.', 401)
  const tenant = await prisma.tenant.findUnique({ where: { id: puente.tenantId }, select: { settings: true } })
  const remoteEnabled = remoteEnabledDeTenant(tenant?.settings)
  const base = { lanCups: lanCupsDeTenant(tenant?.settings), version: puente.version ?? '', remoteEnabled }
  if (!remoteEnabled) return json({ ...base, printers: [], lan: [], defaultPrinterId: null, impresora: '', ancho: 80, copias: 1 })

  const printers = await prisma.printPrinter.findMany({
    where: { tenantId: puente.tenantId, isActive: true, OR: [{ bridgeId: puente.id }, { bridgeId: null }] },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })
  const predeterminada = printers.find(impresora => impresora.isDefault) ?? null
  return json({
    ...base,
    printers,
    lan: printers.filter(impresora => impresora.connection === 'lan' && impresora.destination.startsWith('lan:')).map(impresora => impresora.destination),
    defaultPrinterId: predeterminada?.id ?? null,
    impresora: predeterminada?.destination ?? '',
    ancho: predeterminada?.width ?? 80,
    copias: predeterminada?.copies ?? 1,
  })
}
