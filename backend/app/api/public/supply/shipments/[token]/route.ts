import { prisma } from '../../../../../../lib/prisma'
import { error, json } from '../../../../../../lib/http'
import { enforceRateLimit } from '../../../../../../lib/rate-limit'
import { manifiestoEnvio } from '../../../../../../lib/supply'

// #250 Fase 4 (§3): manifiesto público del envío — es lo que abre el QR impreso
// en el lote, sin sesión y con rate limit. No expone costos, ni proveedor, ni
// cliente: solo lo necesario para recibir la mercadería (código, origen/destino,
// método, unidades e IMEI).
type RouteContext = { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const limited = enforceRateLimit(request, 'public-supply-shipment', 60, 60_000)
  if (limited) return limited

  const { token } = await params
  const envio = await prisma.supplyShipment.findFirst({
    where: { publicToken: String(token || '') },
    include: {
      destinationBranch: { select: { name: true } },
      responsible: { select: { name: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: { line: { select: { id: true } }, product: { select: { name: true, capacity: true } } },
      },
    },
  })
  if (!envio) return error('Manifiesto no encontrado.', 404)

  const base = (process.env.MOBOS_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  const lineas = envio.items.length
    ? await prisma.supplyPurchaseLine.findMany({ where: { id: { in: [...new Set(envio.items.map((item) => item.lineId))] } } })
    : []
  const condicionDe = new Map(lineas.map((linea) => [linea.id, linea.condition]))
  const items = envio.items.map((item) => ({
    lineId: item.lineId,
    producto: item.product?.name || '',
    capacidad: item.product?.capacity || '',
    condicion: condicionDe.get(item.lineId) || 'NEW',
    serial: item.serial,
  }))
  const manifiesto = manifiestoEnvio({ envio, items, base })
  return json(manifiesto)
}
