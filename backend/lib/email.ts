import { MOBOS_IDENTITY } from './identity'
import { emailOutboxEncryptionConfigured } from './email-outbox-crypto'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const relayProject = 'mobos'

function relayUrl() {
  const raw = process.env.WEEM_EMAIL_RELAY_URL || ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    return url.href.replace(/\/$/, '')
  } catch { return null }
}

function relayToken() {
  const value = process.env.WEEM_EMAIL_RELAY_TOKEN || ''
  return value.trim().length >= 16 ? value.trim() : null
}

function appUrl() {
  const raw = process.env.NODE_ENV === 'production' ? MOBOS_IDENTITY.urls.app : process.env.MOBOS_APP_URL || MOBOS_IDENTITY.urls.app
  try {
    const url = new URL(raw)
    const localhost = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !localhost) || url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

/** Confirms local configuration only; it does not probe relay reachability. */
export function emailTransportConfigured() {
  return Boolean(relayUrl() && relayToken() && appUrl() && emailOutboxEncryptionConfigured())
}

export function logEmailOutcome(kind: 'password-recovery' | 'email-verification' | 'welcome' | 'team-invitation' | 'receipt', outcome: 'delivered-to-relay' | 'delivery-failed' | 'unconfigured') {
  console.info(JSON.stringify({ event: 'mobos.transactional_email', kind, outcome }))
}

export async function sendTransactionalEmail(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }) {
  const endpoint = relayUrl()
  const token = relayToken()
  if (!endpoint || !token || !emailPattern.test(input.to) || !input.subject.trim() || !input.html.trim() || !input.text.trim() || !input.idempotencyKey.trim()) return false
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-WEEM-RELAY-TOKEN': token,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey.slice(0, 180),
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ project: relayProject, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
    })
    return response.ok
  } catch { return false }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function actionLink(path: string, token?: string) {
  const origin = appUrl()
  if (!origin) return null
  const link = new URL(path, origin)
  if (token) link.hash = new URLSearchParams({ token }).toString()
  return link.toString()
}

const EMAIL_VERSION = 'v1.1.0'

function template(input: { eyebrow: string; title: string; body: string; lead?: string; action?: { label: string; url: string }; footer: string }) {
  const leadText = input.lead ? `${input.lead}\n\n` : ''
  const actionText = input.action ? `\n\n${input.action.label}: ${input.action.url}` : ''
  const text = `${input.eyebrow.toUpperCase()}\nMobOS\n\n${input.title}\n\n${leadText}${input.body}${actionText}\n\n${input.footer}\n\napp.moboss.online · Email ${EMAIL_VERSION}`
  const leadHtml = input.lead
    ? `<p style="margin:0 0 16px;color:#0b1822;font-weight:700;line-height:1.65">${escapeHtml(input.lead)}</p>`
    : ''
  const actionHtml = input.action
    ? `<p style="margin:28px 0 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:14px 24px;border-radius:10px;background:#05f19c;color:#062118;text-decoration:none;font-weight:700;font-size:15px">${escapeHtml(input.action.label)}</a></p>`
    : ''
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#ffffff;color:#0b1822;font-family:Arial,Helvetica,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;background:#ffffff"><div style="background:#05f19c;padding:28px"><p style="margin:0 0 6px;color:#062118;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p><p style="margin:0;color:#062118;font-size:30px;font-weight:800;letter-spacing:-.02em">MobOS</p></div><div style="padding:28px"><h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#0b1822">${escapeHtml(input.title)}</h1>${leadHtml}<p style="margin:0;color:#1e293b;line-height:1.65">${escapeHtml(input.body)}</p>${actionHtml}<p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">${escapeHtml(input.footer)}</p></div></div><p style="color:#64748b;font-size:12px;text-align:center">app.moboss.online · Email ${EMAIL_VERSION}</p></div></body></html>`
  return { html, text }
}

export function passwordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/restablecer-contrasena', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Seguridad de la cuenta', title: 'Recuperá tu contraseña', body: `Recibimos una solicitud para recuperar la contraseña de ${input.companyName}.`, action: { label: 'Restablecer contraseña', url: link }, footer: 'Este enlace vence en 30 minutos y funciona una sola vez. Si no fuiste vos, ignorá este correo.' })
  return { to: input.to, subject: `Recuperá tu contraseña de ${input.companyName}`, ...content }
}

export function emailVerificationEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/verificar-correo', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Confirmación de correo', title: 'Verificá tu correo', body: `Confirmá que este correo pertenece a ${input.companyName}. Podés seguir usando MobOS mientras tanto.`, action: { label: 'Verificar correo', url: link }, footer: 'Este enlace vence en 60 minutos y funciona una sola vez.' })
  return { to: input.to, subject: 'Verificá tu correo de MobOS', ...content }
}

export function welcomeEmail(input: { to: string; companyName: string; tenantId: string }) {
  const link = actionLink('/login')
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Tu tienda está lista', title: 'Te damos la bienvenida a MobOS', body: `${input.companyName} ya puede organizar ventas, inventario y equipo desde un solo lugar.`, action: { label: 'Abrir MobOS', url: link }, footer: 'Este mensaje no contiene contraseñas ni PIN de acceso.' })
  return { to: input.to, subject: 'Tu tienda ya está en MobOS', ...content }
}

export function teamInvitationEmail(input: { to: string; inviteeName: string; companyName: string; inviterName: string; token: string; invitationId: string }) {
  const link = actionLink('/aceptar-invitacion', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Invitación al equipo', title: `Te invitaron a ${input.companyName}`, lead: `${input.inviterName} te invitó a trabajar con el equipo en MobOS.`, body: 'Al aceptar, tu cuenta va a quedar lista para organizar ventas, inventario y equipo en un solo lugar.', action: { label: 'Aceptar invitación', url: link }, footer: 'El enlace vence en 7 días. Al aceptar, vas a elegir tu propio PIN de 4 dígitos. MobOS nunca envía PIN ni contraseñas por correo.' })
  return { to: input.to, subject: `Invitación al equipo de ${input.companyName}`, ...content }
}
