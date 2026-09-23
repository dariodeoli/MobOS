import { json, error } from '../../../../../lib/http'
import { prisma } from '../../../../../lib/prisma'

// #240: informe público del certificado PhoneCheck (/u/<serial>). Sin sesión y
// sin datos personales: serial enmascarado, sin cliente ni precios.
export async function GET(_request: Request, { params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params
  const buscado = decodeURIComponent(serial || '').trim().toUpperCase()
  if (!buscado) return error('Serial obligatorio.')
  const unit = await prisma.inventoryUnit.findFirst({ where: { serial: buscado }, include: { product: { select: { name: true, capacity: true } } } })
  if (!unit) return error('No hay un certificado para ese serial.', 404)
  const inspeccion = (unit.inspection || {}) as Record<string, any>
  const oculto = buscado.length > 4 ? `${'•'.repeat(buscado.length - 4)}${buscado.slice(-4)}` : buscado
  // #240: el checklist persistido es un objeto por clave con su lista derivada
  // (`itemsLista`); se acepta también la lista histórica en `items`.
  const items = Array.isArray(inspeccion.itemsLista) ? inspeccion.itemsLista : Array.isArray(inspeccion.items) ? inspeccion.items : []
  const locks = Array.isArray(inspeccion.locks) ? inspeccion.locks : []
  return json({
    tipo: 'certificado-phonecheck',
    version: 1,
    titulo: 'Certificado PhoneCheck',
    grado: inspeccion.grado || null,
    puntaje: inspeccion.puntaje ?? null,
    producto: unit.product?.name || '',
    capacidad: unit.product?.capacity || '',
    condicion: unit.condition || '',
    cosmetico: inspeccion.cosmetico || '',
    repuestosNoOem: inspeccion.repuestosNoOem || '',
    repuestosNoOemNota: inspeccion.repuestosNoOemNota || '',
    serial: oculto,
    bateria: { porcentaje: inspeccion.bateriaPct ?? unit.batteryHealth ?? null, ciclos: inspeccion.bateriaCiclos ?? null },
    controles: locks.map((lock: any) => ({ label: lock.label, ok: Boolean(lock.ok) })),
    items: items.map((item: any) => ({ grupo: item.grupo, label: item.label, estado: item.estado, nota: item.estado && item.estado !== 'ok' ? item.nota : '' })),
    verificado: inspeccion.inspeccionadoAt || null,
    verificadoPor: inspeccion.inspeccionadoPor || '',
    aviso: 'iCloud/US Block clean no equivalen a blacklist mundial.',
    qr: ['CERT', oculto, inspeccion.grado || 'P', inspeccion.puntaje ?? '', inspeccion.inspeccionadoAt || ''].join('|'),
  })
}
