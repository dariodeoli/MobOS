import { connect } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'
import { prisma } from './prisma'
import { logError, logInfo } from './log'

// Notificaciones APNs (HTTP/2, autenticación por token .p8) para la app de iPhone.
// Se engancha en `enviarWebPush` (lib/web-push.ts): cada aviso web también sale a
// los iPhones del usuario. Sin variables de entorno es un no-op con log. Mismo
// payload genérico que Web Push: nunca clientes, montos, IMEI ni tokens.
export type ApnsResult = { configurado: boolean; enviados: number; podados: number; fallidos: number }
export type ApnsRequest = { host: string; headers: Record<string, string>; body: string }
export type ApnsResponse = { status: number; body: string }
type Transport = (host: string, requests: Array<{ headers: Record<string, string>; body: string }>) => Promise<ApnsResponse[]>

const HOSTS = { production: 'api.push.apple.com', sandbox: 'api.sandbox.push.apple.com' } as const

export function apnsConfig() {
  const keyId = (process.env.MOBOS_APNS_KEY_ID || '').trim()
  const teamId = (process.env.MOBOS_APNS_TEAM_ID || '').trim()
  const privateKey = (process.env.MOBOS_APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
  const topic = (process.env.MOBOS_APNS_TOPIC || '').trim()
  if (!keyId || !teamId || !privateKey || !topic) return null
  return { keyId, teamId, privateKey, topic }
}

let cachedJwt: { value: string; at: number; keyId: string } | null = null
/** JWT ES256 del proveedor; Apple pide renovarlo entre 20 y 60 min. */
export function apnsJwt(config: NonNullable<ReturnType<typeof apnsConfig>>, now = Date.now()) {
  if (cachedJwt && cachedJwt.keyId === config.keyId && now - cachedJwt.at < 40 * 60_000) return cachedJwt.value
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) })).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`), { key: createPrivateKey(config.privateKey), dsaEncoding: 'ieee-p1363' }).toString('base64url')
  cachedJwt = { value: `${header}.${payload}.${signature}`, at: now, keyId: config.keyId }
  return cachedJwt.value
}

const defaultTransport: Transport = (host, requests) => new Promise((resolve, reject) => {
  const client = connect(`https://${host}`)
  const timer = setTimeout(() => { client.destroy(); reject(new Error('apns_timeout')) }, 15_000)
  client.on('error', cause => { clearTimeout(timer); client.destroy(); reject(cause) })
  Promise.all(requests.map(request => new Promise<ApnsResponse>((done, fail) => {
    const stream = client.request({ ':method': 'POST', ':path': request.headers[':path'], ...Object.fromEntries(Object.entries(request.headers).filter(([key]) => key !== ':path')) })
    let status = 0
    let data = ''
    stream.setEncoding('utf8')
    stream.on('response', headers => { status = Number(headers[':status'] || 0) })
    stream.on('data', chunk => { data += chunk })
    stream.on('end', () => done({ status, body: data }))
    stream.on('error', fail)
    stream.end(request.body)
  }))).then(results => { clearTimeout(timer); client.close(); resolve(results) }, cause => { clearTimeout(timer); client.destroy(); reject(cause) })
})

let transport: Transport = defaultTransport
/** Solo para pruebas: reemplaza el envío HTTP/2 real. */
export function setApnsTransportForTests(next: Transport | null) { transport = next ?? defaultTransport }

export function apnsPayload({ titulo, cuerpo, url = '/', tag = 'mobos' }: { titulo?: string; cuerpo?: string; url?: string; tag?: string }) {
  return JSON.stringify({
    aps: {
      alert: { title: String(titulo || '').trim().slice(0, 120) || 'Tenés una novedad en MobOS', body: String(cuerpo || '').trim().slice(0, 180) || 'Abrí MobOS para verla.' },
      sound: 'default',
      'thread-id': String(tag || 'mobos').trim().slice(0, 64) || 'mobos',
    },
    url: String(url || '').startsWith('/') ? String(url).slice(0, 300) : '/',
  })
}

/** Envía el aviso a todos los iPhones del usuario. Nunca lanza; poda tokens muertos (410/BadDeviceToken). */
export async function enviarApns({ tenantId, userId, titulo, cuerpo, url, tag, urgente = false }: { tenantId: string; userId: string; titulo?: string; cuerpo?: string; url?: string; tag?: string; urgente?: boolean }): Promise<ApnsResult> {
  const vacio: ApnsResult = { configurado: false, enviados: 0, podados: 0, fallidos: 0 }
  try {
    const config = apnsConfig()
    if (!config) {
      const hay = await prisma.deviceToken.count({ where: { tenantId, userId } })
      if (hay) logInfo('apns_not_configured', { devices: hay })
      return vacio
    }
    const dispositivos = await prisma.deviceToken.findMany({ where: { tenantId, userId, platform: 'ios' }, select: { id: true, token: true, environment: true } })
    if (!dispositivos.length) return { ...vacio, configurado: true }
    const body = apnsPayload({ titulo, cuerpo, url, tag })
    const jwt = apnsJwt(config)
    const resultado: ApnsResult = { configurado: true, enviados: 0, podados: 0, fallidos: 0 }
    for (const environment of ['production', 'sandbox'] as const) {
      const grupo = dispositivos.filter(item => (item.environment === 'sandbox' ? 'sandbox' : 'production') === environment)
      if (!grupo.length) continue
      const headers = (token: string) => ({
        ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': config.topic,
        'apns-push-type': 'alert',
        'apns-priority': urgente ? '10' : '5',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
        'content-type': 'application/json',
      })
      let respuestas: ApnsResponse[]
      try {
        respuestas = await transport(HOSTS[environment], grupo.map(item => ({ headers: headers(item.token), body })))
      } catch (cause) {
        resultado.fallidos += grupo.length
        logError('apns_transport_error', { environment, error: cause instanceof Error ? cause.message : String(cause) })
        continue
      }
      for (let i = 0; i < grupo.length; i += 1) {
        const respuesta = respuestas[i]
        if (respuesta?.status === 200) {
          resultado.enviados += 1
          await prisma.deviceToken.update({ where: { id: grupo[i].id }, data: { lastUsedAt: new Date() } }).catch(() => {})
          continue
        }
        let razon = ''
        try { razon = JSON.parse(respuesta?.body || '{}').reason || '' } catch { /* respuesta sin JSON */ }
        if (respuesta?.status === 410 || razon === 'BadDeviceToken' || razon === 'Unregistered' || razon === 'DeviceTokenNotForTopic') {
          resultado.podados += 1
          await prisma.deviceToken.delete({ where: { id: grupo[i].id } }).catch(() => {})
        } else {
          resultado.fallidos += 1
          logError('apns_rejected', { status: respuesta?.status ?? 0, reason: razon })
        }
      }
    }
    return resultado
  } catch (cause) {
    logError('apns_error', { error: cause instanceof Error ? cause.message : String(cause) })
    return vacio
  }
}
