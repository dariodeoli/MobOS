import type { Prisma } from '@prisma/client'

// Espejo indexado de OrderItem.serials (ver modelo OrderItemSerial). El JSON
// sigue siendo el dato que muestra el comprobante; esta tabla existe para
// responder "¿qué venta tiene este IMEI/serial?" con índice. Se sincroniza en
// cada escritura de la línea: es idempotente y tolera valores no textuales.
export async function syncOrderItemSerials(tx: Prisma.TransactionClient, items: Array<{ id: string; serials: unknown }>) {
  for (const item of items) {
    const serials = Array.isArray(item.serials)
      ? [...new Set((item.serials as unknown[]).filter((serial): serial is string => typeof serial === 'string' && serial.trim().length > 0).map((serial) => serial.trim()))]
      : []
    await tx.orderItemSerial.deleteMany({ where: { orderItemId: item.id } })
    if (serials.length) await tx.orderItemSerial.createMany({ data: serials.map((serial) => ({ orderItemId: item.id, serial })), skipDuplicates: true })
  }
}
