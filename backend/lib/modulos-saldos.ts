import type { Prisma } from '@prisma/client'

// Saldos abiertos que impiden apagar un módulo: nunca puede quedar plata (o un
// equipo) que ya no se pueda cobrar, rendir, liquidar o resolver.
export type SaldoAbierto = { moduleId: string; cantidad: number; totalPyg: number; detalle: string }

const gs = (n: number) => `Gs ${n.toLocaleString('es-PY')}`
const num = (v: bigint | number | null | undefined) => Number(v ?? 0)

type Db = Pick<Prisma.TransactionClient, 'payment' | 'storeCredit' | 'giftCard' | 'deliverySettlement' | 'commissionSettlement' | 'tradeInDevice' | 'inventoryUnit'>

const REVISORES: Record<string, (db: Db, tenantId: string, ahora: Date) => Promise<SaldoAbierto | null>> = {
  async cuotas(db, tenantId) {
    const cuotas = await db.payment.aggregate({ where: { tenantId, method: 'CREDIT', status: 'PENDING' }, _count: { _all: true }, _sum: { amountPyg: true } })
    const aFavor = await db.storeCredit.aggregate({ where: { tenantId, remainingPyg: { gt: 0 } }, _count: { _all: true }, _sum: { remainingPyg: true } })
    const cantidad = cuotas._count._all + aFavor._count._all
    if (!cantidad) return null
    const totalPyg = num(cuotas._sum.amountPyg) + num(aFavor._sum.remainingPyg)
    return { moduleId: 'cuotas', cantidad, totalPyg, detalle: `${cuotas._count._all} cuota(s) pendientes y ${aFavor._count._all} saldo(s) a favor de clientes por ${gs(totalPyg)}` }
  },
  async 'gift-cards'(db, tenantId, ahora) {
    const r = await db.giftCard.aggregate({ where: { tenantId, status: 'ACTIVE', balancePyg: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: ahora } }] }, _count: { _all: true }, _sum: { balancePyg: true } })
    if (!r._count._all) return null
    return { moduleId: 'gift-cards', cantidad: r._count._all, totalPyg: num(r._sum.balancePyg), detalle: `${r._count._all} gift card(s) con saldo por ${gs(num(r._sum.balancePyg))}` }
  },
  async delivery(db, tenantId) {
    const cobros = await db.payment.aggregate({ where: { tenantId, status: 'PENDING', deliveryUserId: { not: null } }, _count: { _all: true }, _sum: { amountPyg: true } })
    const rendiciones = await db.deliverySettlement.count({ where: { tenantId, status: 'PENDING' } })
    const cantidad = cobros._count._all + rendiciones
    if (!cantidad) return null
    return { moduleId: 'delivery', cantidad, totalPyg: num(cobros._sum.amountPyg), detalle: `${cobros._count._all} cobro(s) de reparto sin rendir por ${gs(num(cobros._sum.amountPyg))} y ${rendiciones} rendición(es) sin verificar` }
  },
  async comisiones(db, tenantId) {
    const r = await db.commissionSettlement.aggregate({ where: { tenantId, status: 'DRAFT' }, _count: { _all: true }, _sum: { totalPyg: true } })
    if (!r._count._all) return null
    return { moduleId: 'comisiones', cantidad: r._count._all, totalPyg: num(r._sum.totalPyg), detalle: `${r._count._all} liquidación(es) de comisiones sin pagar por ${gs(num(r._sum.totalPyg))}` }
  },
  // El POS pide el IMEI exacto de los equipos con unidades: mientras haya equipos
  // en stock, reservados, en revisión o en tránsito, la vista de unidades no se apaga.
  async 'inventario-unidades'(db, tenantId) {
    const cantidad = await db.inventoryUnit.count({ where: { tenantId, removedAt: null, status: { in: ['AVAILABLE', 'RESERVED', 'DEFECTIVE', 'IN_TRANSIT'] } } })
    if (!cantidad) return null
    return { moduleId: 'inventario-unidades', cantidad, totalPyg: 0, detalle: `${cantidad} equipo(s) con IMEI/serie en stock, reservados, en revisión o en tránsito (vendelos o dalos de baja primero)` }
  },
  async tradein(db, tenantId) {
    const r = await db.tradeInDevice.aggregate({ where: { tenantId, status: { in: ['RECEIVED', 'REVIEW', 'REPAIR', 'READY'] } }, _count: { _all: true }, _sum: { valuePyg: true } })
    if (!r._count._all) return null
    return { moduleId: 'tradein', cantidad: r._count._all, totalPyg: num(r._sum.valuePyg), detalle: `${r._count._all} equipo(s) recibidos como parte de pago todavía en curso` }
  },
}

/** Módulos con control de saldos al apagarse. */
export const MODULOS_CON_SALDOS = Object.keys(REVISORES)

/** Saldos abiertos de los módulos pedidos (solo revisa los que tienen control). */
export async function saldosAbiertos(db: Db, tenantId: string, moduleIds: readonly string[], ahora = new Date()): Promise<SaldoAbierto[]> {
  const encontrados: SaldoAbierto[] = []
  for (const id of moduleIds) {
    const revisar = REVISORES[id]
    if (!revisar) continue
    const saldo = await revisar(db, tenantId, ahora)
    if (saldo) encontrados.push(saldo)
  }
  return encontrados
}

export function mensajeSaldos(saldos: readonly SaldoAbierto[]) {
  return `No se puede desactivar: quedan saldos abiertos. Resolvelos primero: ${saldos.map(s => s.detalle).join('; ')}.`
}
