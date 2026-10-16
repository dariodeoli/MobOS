import { cargarUnidadInforme } from '../../../../../lib/public-unit'
import { contactoPublicoSucursal } from '../../../../../lib/public-contact'
import { prisma } from '../../../../../lib/prisma'
import { error, json } from '../../../../../lib/http'
import { enforceRateLimit } from '../../../../../lib/rate-limit'
import { serialSeguimiento } from '../../../../../lib/device-report'
import { checklistPublico, normalizarInspectionItems } from '../../../../../lib/inspection'
import { controlesPublicos } from '../../../../../lib/imeicheck'

// Informe de dispositivo público (#240 ítem 3, acceso CRM #236+): la tienda que
// vendió/verificó el equipo muestra un informe informativo por serial, con el
// IMEI enmascarado y los datos que ya existen (condición, batería, verificación
// física, venta y garantía). El grado/checklist de la inspección de INV se
// suman cuando estén disponibles (mismo contrato que la valuación con grado).
const CONDICION: Record<string, string> = { NEW: 'Nuevo', USED: 'Seminuevo', REFURBISHED: 'Reacondicionado' }
const ESTADO_GARANTIA: Record<string, string> = { RECEIVED: 'Recibida', DIAGNOSIS: 'En diagnóstico', READY: 'Lista', DELIVERED: 'Entregada' }

const enmascarar = (valor: string) => {
  const texto = String(valor || '').trim()
  if (texto.length <= 6) return texto
  return `${texto.slice(0, 4)}…${texto.slice(-3)}`
}

export async function GET(request: Request, context: { params: Promise<{ serial: string }> }) {
  const limited = enforceRateLimit(request, 'public-unit', 30, 60_000)
  if (limited) return limited

  const { serial: crudo } = await context.params
  const serial = String(crudo || '').trim().slice(0, 64)
  if (serial.length < 6) return error('Serial inválido.', 400)

  const seleccion = await cargarUnidadInforme(prisma, serial)
  if (!seleccion) return error('Equipo no encontrado.', 404)
  const { elegida, venta } = seleccion
  const sucursal = elegida.branch || venta?.orderItem.order.branch || null
  const inspeccion = (elegida.inspection || {}) as Record<string, any>

  const [check, garantia] = await Promise.all([
    prisma.imeiCheckQuery.findFirst({ where: { tenantId: elegida.tenantId, imei: elegida.serial }, orderBy: { requestedAt: 'desc' }, select: { imeiMasked: true, provider: true, status: true, requestedAt: true, normalized: true } }),
    prisma.warrantyCase.findFirst({ where: { tenantId: elegida.tenantId, serial: elegida.serial }, orderBy: { createdAt: 'desc' }, select: { status: true, warrantyDays: true, description: true, createdAt: true } }),
  ])

  const venceGarantia = garantia?.warrantyDays ? new Date(new Date(garantia.createdAt).getTime() + garantia.warrantyDays * 86400000) : null

  // Seguimiento del informe compartido (#240 ítem 3): la apertura del link
  // público marca «visto» en la ficha del cliente. La vista previa de la app
  // viaja con `?preview=1` y no cuenta; tampoco los equipos sin cliente.
  // El certificado embebible ([#240] §3, con INV) viaja con `?embed=1` y queda
  // registrado con ese origen para que la cronología diga de dónde se abrió.
  const parametros = new URL(request.url).searchParams
  if (parametros.get('preview') !== '1') {
    await marcarInformeVisto({
      tenantId: elegida.tenantId,
      serial: elegida.serial,
      customerId: venta?.orderItem.order.customerId || null,
      origen: parametros.get('embed') === '1' ? 'EMBED' : null,
    })
  }

  return json({
    contacto: contactoPublicoSucursal(sucursal?.tenantId === elegida.tenantId ? sucursal : null),
    store: { name: elegida.tenant?.name || 'Tienda', branch: elegida.branch?.name || venta?.orderItem.order.branch?.name || null },
    unit: {
      model: elegida.product?.name || 'Equipo',
      serialMasked: enmascarar(elegida.serial),
      imeiMasked: check?.imeiMasked || enmascarar(elegida.serial),
      condition: CONDICION[elegida.condition] || elegida.condition,
      // La inspección manda sobre el dato cargado al recibir (igual que el papel).
      batteryHealth: inspeccion.bateriaPct ?? elegida.batteryHealth ?? null,
      batteryCycles: inspeccion.bateriaCiclos ?? null,
      verifiedAt: elegida.lastVerifiedAt,
      verifiedBy: elegida.lastVerifiedBy?.name || null,
      verifiedByCode: elegida.verifiedByCode || null,
      verificationCount: elegida.verificationCount || 0,
      // La inspección de INV (#240): grado, checklist con semáforo (notas solo
      // de lo no-OK) y repuestos no-OEM detectados.
      grade: inspeccion.grado || null,
      checklist: checklistPublico(normalizarInspectionItems(inspeccion.items)),
      repuestosNoOem: String(inspeccion.repuestosNoOem || ''),
      repuestosNoOemNota: String(inspeccion.repuestosNoOemNota || ''),
      // #240: semáforo de los locks de la última consulta (iCloud/MDM/ESN/carrier).
      controles: controlesPublicos(check?.normalized),
    },
    sale: venta ? { orderNumber: venta.orderItem.order.orderNumber, date: venta.orderItem.order.createdAt, branch: venta.orderItem.order.branch?.name || null } : null,
    warranty: garantia ? { status: ESTADO_GARANTIA[garantia.status] || garantia.status, description: garantia.description, expiresAt: venceGarantia } : null,
    check: check ? { provider: check.provider, status: check.status, date: check.requestedAt } : null,
    disclaimer: 'Informe informativo de la tienda que verificó el equipo. No es un certificado oficial ni reemplaza la garantía del fabricante.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// Registra la apertura del informe (#240 ítem 3): la primera vez agrega el
// evento a la cronología del cliente; siempre actualiza contador y última
// apertura de la fila de seguimiento. Un equipo nunca compartido ni vendido no
// deja rastro (la ruta es pública y no se escribe por cualquier consulta).
async function marcarInformeVisto({ tenantId, serial, customerId, origen }: { tenantId: string; serial: string; customerId: string | null; origen?: string | null }) {
  const clave = serialSeguimiento(serial)
  const ahora = new Date()
  const anotarEvento = (customerIdFila: string, canal: string | null) => prisma.auditLog.create({
    data: {
      tenantId,
      action: 'CUSTOMER_DEVICE_REPORT_VIEWED',
      entity: 'Customer',
      entityId: customerIdFila,
      metadata: { serial: clave, canal: origen || canal || 'PORTAL' },
    },
  })

  const fila = await prisma.deviceReportShare.findUnique({ where: { tenantId_serial: { tenantId, serial: clave } } })
  if (fila) {
    const primera = !fila.firstViewedAt
    await prisma.deviceReportShare.update({
      where: { id: fila.id },
      data: { firstViewedAt: fila.firstViewedAt || ahora, lastViewedAt: ahora, viewCount: { increment: 1 } },
    })
    if (primera) await anotarEvento(fila.customerId, fila.channel)
    return
  }

  if (!customerId) return
  try {
    await prisma.deviceReportShare.create({
      data: { tenantId, customerId, serial: clave, firstViewedAt: ahora, lastViewedAt: ahora, viewCount: 1 },
    })
    await anotarEvento(customerId, null)
  } catch {
    // Carrera con otra apertura simultánea: la fila ya quedó creada y el
    // evento lo anota el request que ganó.
  }
}
