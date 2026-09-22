import { prisma } from '../../../../lib/prisma'
import { json } from '../../../../lib/http'
import { fechaEventoAex, normalizarEventoWebhook, webhookAutorizado } from '../../../../lib/aex'

// Webhook de AEX: por cada evento de una guía AEX hace POST y reintenta hasta 4
// veces si no recibe 200 con {"isSuccess": true}. Es un endpoint público: se
// autentica con el header acordado (MOBOS_AEX_WEBHOOK_TOKEN) y solo escribe el
// evento; el stock se mueve desde la app.
export async function POST(request: Request) {
  if (!webhookAutorizado(request)) return json({ isSuccess: false }, { status: 401 })
  let payload: unknown
  try { payload = await request.json() } catch { return json({ isSuccess: false }, { status: 400 }) }
  const evento = normalizarEventoWebhook(payload)
  if (!evento) return json({ isSuccess: false }, { status: 400 })
  const fecha = fechaEventoAex(evento.fechaEvento)
  try {
    const transfer = await prisma.stockTransfer.findFirst({ where: { aexGuide: evento.guia }, select: { id: true, tenantId: true } })
    // AEX reintenta el mismo evento: no se duplica.
    const repetido = await prisma.aexWebhookEvent.findFirst({
      where: {
        guia: evento.guia,
        codigoEstado: evento.codigoEstado || null,
        codigoTipoEvento: evento.codigoTipoEvento || null,
        fechaEvento: fecha,
      },
      select: { id: true },
    })
    if (!repetido) {
      await prisma.aexWebhookEvent.create({
        data: {
          guia: evento.guia,
          tenantId: transfer?.tenantId ?? null,
          transferId: transfer?.id ?? null,
          codigoEstado: evento.codigoEstado || null,
          estado: evento.estado || null,
          codigoTipoEvento: evento.codigoTipoEvento || null,
          tipoEvento: evento.tipoEvento || null,
          observacion: evento.observacion || null,
          codigoOperacion: evento.codigoOperacion || null,
          fechaEvento: fecha,
        },
      })
    }
    return json({ isSuccess: true })
  } catch (cause) {
    // Solo el mensaje: los objetos de error de Prisma pueden incluir metadatos
    // del registro y no queremos volcar datos en los logs (#232).
    console.error('[aex] no se pudo guardar el evento del webhook:', cause instanceof Error ? cause.message : String(cause))
    return json({ isSuccess: false }, { status: 400 })
  }
}
