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

function template(input: { eyebrow: string; title: string; body: string; action?: { label: string; url: string }; footer: string }) {
  const actionText = input.action ? `\n\n${input.action.label}: ${input.action.url}` : ''
  const text = `${input.title}\n\n${input.body}${actionText}\n\n${input.footer}`
  const actionHtml = input.action
    ? `<p style="margin:28px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#38bdf8;color:#071018;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a></p>`
    : ''
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#071018;color:#e5eef5;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="border:1px solid #203442;border-radius:16px;background:#0b1822;padding:30px"><p style="margin:0 0 12px;color:#38bdf8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p><h1 style="margin:0 0 18px;font-size:26px;line-height:1.2">${escapeHtml(input.title)}</h1><p style="margin:0;color:#b6c5cf;line-height:1.65">${escapeHtml(input.body)}</p>${actionHtml}<p style="margin:24px 0 0;color:#7f929f;font-size:13px;line-height:1.6">${escapeHtml(input.footer)}</p></div><p style="color:#607481;font-size:12px;text-align:center">MobOS · app.moboss.online</p></div></body></html>`
  return { html, text }
}

export function passwordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/restablecer-contrasena', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Seguridad de la cuenta', title: 'Restablecé tu contraseña', body: `Recibimos una solicitud para restablecer la contraseña de ${input.companyName}.`, action: { label: 'Restablecer contraseña', url: link }, footer: 'Este enlace vence en 30 minutos y funciona una sola vez. Si no fuiste vos, ignorá este correo.' })
  return { to: input.to, subject: `Restablecé tu contraseña de ${input.companyName}`, ...content }
}

export function emailVerificationEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/verificar-correo', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Confirmación de correo', title: 'Verificá el correo de tu tienda', body: `Confirmá que este correo pertenece a ${input.companyName}. Podés seguir usando MobOS mientras tanto.`, action: { label: 'Verificar correo', url: link }, footer: 'El enlace vence en 60 minutos y funciona una sola vez.' })
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
  const content = template({ eyebrow: 'Invitación al equipo', title: `Te invitaron a ${input.companyName}`, body: `${input.inviterName} invitó a ${input.inviteeName} a trabajar con el equipo en MobOS.`, action: { label: 'Aceptar invitación', url: link }, footer: 'El enlace vence en 7 días. Al aceptar vas a elegir tu propio PIN de 4 dígitos. MobOS nunca envía PIN ni contraseñas por correo.' })
  return { to: input.to, subject: `Invitación al equipo de ${input.companyName}`, ...content }
}
