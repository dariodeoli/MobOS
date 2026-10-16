import type { PrismaClient } from '@prisma/client'

// Una única selección para el informe y su logo: una venta de otra empresa
// con el mismo serial nunca decide qué tienda publica este equipo.
export function elegirUnidadInforme<U extends { tenantId: string; serial: string; lastVerifiedAt?: Date | null }, V extends { serial: string; orderItem: { order: { tenantId: string } } }>(unidades: U[], ventas: V[]) {
  if (!unidades.length) return null
  const ventaDe = (unidad: U) => ventas.find(venta => venta.serial.toLowerCase() === unidad.serial.toLowerCase() && venta.orderItem.order.tenantId === unidad.tenantId) || null
  const elegida = unidades.find(unidad => ventaDe(unidad)) || [...unidades].sort((a, b) => (b.lastVerifiedAt?.getTime() || 0) - (a.lastVerifiedAt?.getTime() || 0))[0]
  return { elegida, venta: ventaDe(elegida) }
}

export async function cargarUnidadInforme(prisma: PrismaClient, serial: string) {
  const unidades = await prisma.inventoryUnit.findMany({
    where: { serial: { equals: serial, mode: 'insensitive' } },
    include: { product: { select: { name: true } }, branch: { select: { name: true, phone: true, tenantId: true } }, tenant: { select: { name: true } }, lastVerifiedBy: { select: { name: true } } }, take: 10,
  })
  if (!unidades.length) return null
  const ventas = await prisma.orderItemSerial.findMany({
    where: { serial: { in: unidades.map(unidad => unidad.serial) } },
    include: { orderItem: { include: { order: { select: { tenantId: true, orderNumber: true, createdAt: true, customerId: true, branch: { select: { name: true, phone: true, tenantId: true } } } } } } },
    orderBy: { orderItem: { order: { createdAt: 'desc' } } }, take: 10,
  })
  return elegirUnidadInforme(unidades, ventas)
}
