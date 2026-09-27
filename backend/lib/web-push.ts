// A1 (#279) · Web Push: notificaciones del navegador con permiso. La bandeja
// interna del panel sigue siendo la **fuente oficial**; el push solo avisa. El
// payload viaja **sin datos sensibles** (título/cuerpo genéricos + ruta interna)
// porque el aviso puede verse en la pantalla bloqueada del dispositivo.
import webpush from 'web-push'
import { prisma } from './prisma'

const TZ_TIENDA = 'America/Asuncion'
/** Sugerido por el plan A1: silencio 22:00–07:00 salvo avisos urgentes. */
export const SILENCIO_SUGERIDO = { desde: 22 * 60, hasta: 7 * 60 }

export type SuscripcionEntrante = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

export function vapidConfig() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = String(process.env.VAPID_SUBJECT || '').trim() || 'mailto:soporte@moboss.online'
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

/** Config local (no prueba alcanzabilidad del servicio de push). */
export function webPushConfigured() {
  return Boolean(vapidConfig())
}

export function clavePublicaWebPush() {
  return vapidConfig()?.publicKey || ''
}

/** Hora local de la tienda (Paraguay) en minutos desde 00:00. */
export function horaLocalEnMinutos(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: TZ_TIENDA, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ahora)
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value || 0)
  const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value || 0)
  return (hora % 24) * 60 + minuto
}

/**
 * ¿La hora cae dentro del silencio? Acepta ventanas que cruzan medianoche
 * (22:00→07:00). `desde === hasta` (o alguno nulo) significa “sin silencio”.
 */
export function dentroDeHorarioSilencioso(desde: number | null | undefined, hasta: number | null | undefined, minutos: number) {
  if (desde === null || desde === undefined || hasta === null || hasta === undefined || desde === hasta) return false
  const limite = (valor: number) => Math.max(0, Math.min(1439, Math.round(valor)))
  const inicio = limite(desde)
  const fin = limite(hasta)
  const ahora = limite(minutos)
  return inicio < fin ? ahora >= inicio && ahora < fin : ahora >= inicio || ahora < fin
}

/** Cuerpo del push: genérico y corto (nunca cliente, montos, IMEI ni tokens). */
export function payloadWebPush({ titulo, cuerpo, url = '/', tag = 'mobos' }: { titulo?: string; cuerpo?: string; url?: string; tag?: string }) {
  return JSON.stringify({
    titulo: String(titulo || '').trim().slice(0, 120) || 'Tenés una novedad en MobOS',
    cuerpo: String(cuerpo || '').trim().slice(0, 180) || 'Abrí MobOS para verla.',
    url: String(url || '').startsWith('/') ? String(url).slice(0, 300) : '/',
    tag: String(tag || 'mobos').trim().slice(0, 64) || 'mobos',
  })
}

export async function suscribirWebPush({ tenantId, userId, suscripcion, userAgent = '', silencioDesde = null, silencioHasta = null }: { tenantId: string; userId: string; suscripcion: SuscripcionEntrante; userAgent?: string; silencioDesde?: number | null; silencioHasta?: number | null }) {
  const endpoint = String(suscripcion?.endpoint || '').trim()
  const p256dh = String(suscripcion?.keys?.p256dh || '').trim()
  const auth = String(suscripcion?.keys?.auth || '').trim()
  if (!endpoint.startsWith('https://') || endpoint.length > 800 || !p256dh || !auth) return { ok: false as const, motivo: 'suscripcion-invalida' }
  const fila = await prisma.webPushSubscription.upsert({
    where: { endpoint },
    create: { tenantId, userId, endpoint, p256dh, auth, userAgent: String(userAgent || '').slice(0, 300) || null, silencioDesde, silencioHasta },
    update: { tenantId, userId, p256dh, auth, userAgent: String(userAgent || '').slice(0, 300) || null, silencioDesde, silencioHasta },
    select: { id: true },
  })
  return { ok: true as const, id: fila.id }
}

export async function quitarWebPush({ tenantId, userId, endpoint }: { tenantId: string; userId: string; endpoint: string }) {
  const borradas = await prisma.webPushSubscription.deleteMany({ where: { tenantId, userId, endpoint: String(endpoint || '').slice(0, 800) } })
  return { ok: true as const, borradas: borradas.count }
}

/**
 * Envía un aviso genérico a todos los dispositivos del usuario. Respeta el
 * horario silencioso de cada suscripción (los `urgente` lo saltean) y poda los
 * endpoints muertos (404/410). Nunca lanza: si el push falla, la bandeja interna
 * sigue siendo la fuente oficial.
 */
export async function enviarWebPush({ tenantId, userId, titulo, cuerpo, url = '/', tag = 'mobos', urgente = false, ahora = new Date() }: { tenantId: string; userId: string; titulo?: string; cuerpo?: string; url?: string; tag?: string; urgente?: boolean; ahora?: Date }) {
  const config = vapidConfig()
  if (!config) return { configurado: false, enviados: 0, silenciados: 0, podados: 0 }
  const suscripciones = await prisma.webPushSubscription.findMany({ where: { tenantId, userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, silencioDesde: true, silencioHasta: true } })
  if (!suscripciones.length) return { configurado: true, enviados: 0, silenciados: 0, podados: 0 }
  try { webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey) } catch { return { configurado: false, enviados: 0, silenciados: 0, podados: 0 } }

  const minutos = horaLocalEnMinutos(ahora)
  const cuerpoPush = payloadWebPush({ titulo, cuerpo, url, tag })
  let enviados = 0
  let silenciados = 0
  let podados = 0
  for (const fila of suscripciones) {
    if (!urgente && dentroDeHorarioSilencioso(fila.silencioDesde, fila.silencioHasta, minutos)) { silenciados += 1; continue }
    try {
      await webpush.sendNotification({ endpoint: fila.endpoint, keys: { p256dh: fila.p256dh, auth: fila.auth } }, cuerpoPush, { TTL: 3600, urgency: urgente ? 'high' : 'normal' })
      enviados += 1
      await prisma.webPushSubscription.update({ where: { id: fila.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
    } catch (cause) {
      const estado = Number((cause as { statusCode?: number })?.statusCode || 0)
      if (estado === 404 || estado === 410) {
        podados += 1
        await prisma.webPushSubscription.delete({ where: { id: fila.id } }).catch(() => {})
      }
    }
  }
  return { configurado: true, enviados, silenciados, podados }
}
