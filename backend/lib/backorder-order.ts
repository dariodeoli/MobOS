// Venta sin stock · estado en vivo de un pedido (interno y público).
//
// Se calcula al leer (nunca se guarda ni entra al `receiptSnapshot`): el pedido
// público y la reimpresión muestran la franja «Estado de tu pedido» con lo que
// pasa hoy. Sin costos, proveedores ni datos internos.
import type { Prisma, PrismaClient } from '@prisma/client'
import { ajustesSobrePedido, ESTADO_SOBRE_PEDIDO_LABEL, estadoDelPedido, estadoSobrePedido, pedidoEntregado, textoPublicoSobrePedido, type EstadoPublico, type EstadoSobrePedido } from './backorder-status'

type Db = PrismaClient | Prisma.TransactionClient

export type ItemParaEstado = { id: string; description?: string | null; stockPending?: number | null; serialsPending?: number | null; backorderArrivedAt?: Date | string | null }
export type OrdenParaEstado = { id: string; fulfillmentStatus: string; expectedAt?: Date | string | null; deliveryType?: string | null; items: ItemParaEstado[] }

export type EstadoDeLinea = {
  itemId: string
  estado: EstadoSobrePedido | null
  estadoLabel: string | null
  prometidaEl: Date | null
  avisadoEl: Date | null
  pendientes: number
}

export type EstadoDePedido = { estado: EstadoSobrePedido | null; estadoLabel: string | null; prometidaEl: Date | null; lineas: EstadoDeLinea[] }

const ESTADOS_LOTE_EN_CAMINO = ['DESPACHADO', 'EN_TRANSITO', 'CON_INCIDENCIA', 'RECEPCION_PARCIAL']

export async function estadoSobrePedidoDeOrden(db: Db, tenantId: string, orden: OrdenParaEstado): Promise<EstadoDePedido> {
  const necesidades = await db.supplyNeed.findMany({
    where: { tenantId, orderId: orden.id },
    select: { id: true, orderItemId: true, status: true, quantity: true, arrivedAt: true, promisedAt: true, purchaseId: true, customerNotifiedAt: true },
  })
  const compras = [...new Set(necesidades.map((necesidad) => necesidad.purchaseId).filter((id): id is string => Boolean(id)))]
  const lotes = compras.length ? await db.supplyShipment.findMany({ where: { tenantId, purchaseId: { in: compras }, status: { in: ESTADOS_LOTE_EN_CAMINO } }, select: { purchaseId: true, status: true } }) : []
  const loteDe = new Map(lotes.map((lote) => [lote.purchaseId, lote.status]))
  const entregado = pedidoEntregado(orden.fulfillmentStatus)
  const lineas: EstadoDeLinea[] = orden.items.map((item) => {
    const necesidad = necesidades.find((fila) => fila.orderItemId === item.id) ?? null
    const estado = estadoSobrePedido({
      stockPending: item.stockPending, serialsPending: item.serialsPending, backorderArrivedAt: item.backorderArrivedAt,
      need: necesidad ? { status: necesidad.status, quantity: necesidad.quantity, arrivedAt: necesidad.arrivedAt } : null,
      shipmentStatus: necesidad?.purchaseId ? loteDe.get(necesidad.purchaseId) ?? null : null,
      entregado,
    })
    const prometida = necesidad?.promisedAt ?? (orden.expectedAt ? new Date(orden.expectedAt) : null)
    return {
      itemId: item.id,
      estado,
      estadoLabel: estado ? ESTADO_SOBRE_PEDIDO_LABEL[estado] : null,
      prometidaEl: prometida,
      avisadoEl: necesidad?.customerNotifiedAt ?? null,
      pendientes: Math.max(0, Math.round(Number(item.stockPending) || 0)) + Math.max(0, Math.round(Number(item.serialsPending) || 0)),
    }
  })
  const estado = estadoDelPedido(lineas.map((linea) => linea.estado))
  const fechas = lineas.filter((linea) => linea.estado && linea.estado !== 'LLEGO' && linea.estado !== 'ENTREGADO' && linea.prometidaEl).map((linea) => linea.prometidaEl!.getTime())
  return { estado, estadoLabel: estado ? ESTADO_SOBRE_PEDIDO_LABEL[estado] : null, prometidaEl: fechas.length ? new Date(Math.max(...fechas)) : null, lineas }
}

export type FranjaPublica = { estado: EstadoSobrePedido; titulo: string; detalle: string | null; lineas: Array<{ descripcion: string; titulo: string }> }

/** Franja «Estado de tu pedido» para el cliente (null si el pedido no tuvo líneas sobre pedido). */
export function franjaPublicaDeEstado(estadoPedido: EstadoDePedido, items: Array<{ id: string; description?: string | null }>, { settings, entregaADomicilio = false }: { settings?: unknown; entregaADomicilio?: boolean } = {}): FranjaPublica | null {
  if (!estadoPedido.estado) return null
  const { backorderShowEtaOnReceipt } = ajustesSobrePedido(settings)
  const opciones = { mostrarFecha: backorderShowEtaOnReceipt, entregaADomicilio }
  const general: EstadoPublico | null = textoPublicoSobrePedido(estadoPedido.estado, { ...opciones, fechaPrometida: estadoPedido.prometidaEl })
  if (!general) return null
  const lineas = estadoPedido.lineas.flatMap((linea) => {
    if (!linea.estado) return []
    const texto = textoPublicoSobrePedido(linea.estado, { ...opciones, fechaPrometida: linea.prometidaEl })
    const item = items.find((fila) => fila.id === linea.itemId)
    return texto ? [{ descripcion: item?.description || 'Producto', titulo: texto.titulo }] : []
  })
  return { estado: general.estado, titulo: general.titulo, detalle: general.detalle, lineas }
}
