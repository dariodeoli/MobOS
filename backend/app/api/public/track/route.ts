import { randomUUID } from 'node:crypto'
import { prisma } from '../../../../lib/prisma'
import { logError } from '../../../../lib/log'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { MAX_CUERPO_BYTES, esBot, pideNoSerMedido, validarEvento } from '../../../../lib/site-events'

// Medición propia (público, sin sesión). Nunca bloquea ni informa al cliente:
// responde 204 salvo límites (413/429). No guarda IP ni agente de usuario.
const POR_MINUTO = limitePositivo(process.env.MOBOS_TRACK_MINUTE_MAX, 60)
const POR_DIA = limitePositivo(process.env.MOBOS_TRACK_DAILY_MAX, 600)

function limitePositivo(valor: unknown, defecto: number) {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : defecto
}

const vacio = () => new Response(null, { status: 204 })

export async function POST(request: Request) {
  // Respeta DNT / Global Privacy Control: no se mide y no se guarda nada.
  if (pideNoSerMedido(request.headers)) return vacio()
  const largo = Number(request.headers.get('content-length') || 0)
  if (largo > MAX_CUERPO_BYTES) return new Response(null, { status: 413 })
  const limitadoDia = enforceRateLimit(request, 'track-daily', POR_DIA, 24 * 60 * 60 * 1000)
  if (limitadoDia) return limitadoDia
  const limitado = enforceRateLimit(request, 'track', POR_MINUTO, 60_000)
  if (limitado) return limitado
  const userAgent = request.headers.get('user-agent')
  if (esBot(userAgent)) return vacio()
  try {
    const texto = await request.text()
    if (texto.length > MAX_CUERPO_BYTES) return new Response(null, { status: 413 })
    let cuerpo: unknown = null
    try { cuerpo = JSON.parse(texto) } catch { return vacio() }
    const evento = validarEvento(cuerpo, userAgent)
    if (!evento) return vacio()
    await prisma.siteEvent.create({ data: { id: randomUUID(), ...evento } })
  } catch (cause) {
    logError('site_event_persist_failed', { reason: cause instanceof Error ? cause.message : String(cause) })
  }
  return vacio()
}
