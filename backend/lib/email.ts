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

export function logEmailOutcome(kind: 'password-recovery' | 'email-verification' | 'welcome' | 'team-invitation' | 'receipt' | 'payment-due' | 'payment-overdue' | 'warranty-update' | 'reservation-due' | 'device-report', outcome: 'delivered-to-relay' | 'delivery-failed' | 'unconfigured') {
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

export function actionLink(path: string, token?: string) {
  const origin = appUrl()
  if (!origin) return null
  // El token viaja en el PATH: inmune a los redirects de tracking de los
  // relays de correo (WEEM), que pierden query y fragmento. El frontend lo
  // consume y limpia la URL de inmediato.
  const link = new URL(token ? `${path}/${encodeURIComponent(token)}` : path, origin)
  return link.toString()
}

const EMAIL_VERSION = 'v1.2.1'

function formatPyg(value: number) {
  return `Gs. ${Number(value).toLocaleString('es-PY')}`
}

// Paleta del tema claro de la app: el correo se ve como el producto.
const COLOR = {
  papel: '#f4f7fa',
  tinta: '#ffffff',
  borde: '#cbd5e2',
  linea: '#e0e7f0',
  texto: '#080e1a',
  suave: '#3a465a',
  marca: '#10b981',
  sobreMarca: '#041c12',
}

// Un solo encabezado: el asunto visual es el título; el "eyebrow" viaja como
// preheader oculto (texto de vista previa) y nunca se repite como cabecera.
// El relay de correo ya agrega su propia cabecera con la marca.
function template(input: { eyebrow: string; title: string; body: string; lead?: string; action?: { label: string; url: string }; footer: string; contentHtml?: string; contentText?: string }) {
  const leadText = input.lead ? `${input.lead}\n\n` : ''
  const contentText = input.contentText ? `\n\n${input.contentText}` : ''
  const actionText = input.action ? `\n\n${input.action.label}: ${input.action.url}` : ''
  const text = `${input.title}\n\n${leadText}${input.body}${contentText}${actionText}\n\n${input.footer}\n\napp.moboss.online · Email ${EMAIL_VERSION}`
  const leadHtml = input.lead
    ? `<p style="margin:0 0 14px;color:${COLOR.texto};font-size:15px;font-weight:700;line-height:1.6">${escapeHtml(input.lead)}</p>`
    : ''
  // El botón va acompañado del enlace visible: si el tracker del relay o el
  // cliente de correo rompen el botón, el enlace se puede copiar y pegar.
  const actionHtml = input.action
    ? `<p style="margin:26px 0 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 26px;border-radius:12px;background:${COLOR.marca};color:${COLOR.sobreMarca};text-decoration:none;font-weight:700;font-size:15px">${escapeHtml(input.action.label)}</a></p><p style="margin:12px 0 0;color:${COLOR.suave};font-size:12px;line-height:1.6;word-break:break-all">Si el botón no funciona, copiá y pegá este enlace:<br><a href="${escapeHtml(input.action.url)}" style="color:#059669">${escapeHtml(input.action.url)}</a></p>`
    : ''
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(input.eyebrow)} · ${escapeHtml(input.title)}</div>`
  // contentHtml es HTML de confianza interna: quien lo provee ya escapó su entrada.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(input.title)}</title></head><body style="margin:0;padding:0;background:${COLOR.papel};color:${COLOR.texto};font-family:Arial,Helvetica,sans-serif">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.papel};border-collapse:collapse"><tbody><tr><td align="center" style="padding:28px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${COLOR.tinta};border:1px solid ${COLOR.borde};border-radius:16px;border-collapse:separate"><tbody><tr><td style="padding:32px"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:${COLOR.texto}">${escapeHtml(input.title)}</h1>${leadHtml}<p style="margin:0;color:${COLOR.suave};font-size:15px;line-height:1.65">${escapeHtml(input.body)}</p>${input.contentHtml || ''}${actionHtml}<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid ${COLOR.linea};color:${COLOR.suave};font-size:13px;line-height:1.6">${escapeHtml(input.footer)}</p></td></tr></tbody></table><p style="margin:14px 0 0;color:${COLOR.suave};font-size:11px">app.moboss.online · Email ${EMAIL_VERSION}</p></td></tr></tbody></table></body></html>`
  return { html, text }
}

export function passwordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/restablecer-contrasena', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Seguridad de la cuenta', title: 'Recuperá tu contraseña', body: `Recibimos una solicitud para recuperar la contraseña de tu cuenta en ${input.companyName}.`, action: { label: 'Restablecer contraseña', url: link }, footer: 'Este enlace vence en 30 minutos y funciona una sola vez. Si no fuiste vos, ignorá este correo.' })
  return { to: input.to, subject: `Recuperá tu contraseña de ${input.companyName}`, ...content }
}

export function emailVerificationEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/verificar-correo', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const content = template({ eyebrow: 'Confirmación de correo', title: 'Verificá tu correo', body: `Confirmá que este correo pertenece a tu cuenta de ${input.companyName}. Podés seguir usando MobOS mientras tanto.`, action: { label: 'Verificar correo', url: link }, footer: 'Este enlace vence en 60 minutos y funciona una sola vez.' })
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
  const content = template({ eyebrow: 'Invitación al equipo', title: `Te invitaron a ${input.companyName}`, lead: `${input.inviterName} te invitó a trabajar con el equipo en MobOS.`, body: 'Al aceptar, vas a elegir tu propio PIN de 4 dígitos.', action: { label: 'Aceptar invitación', url: link }, footer: 'El enlace vence en 7 días. MobOS nunca envía PIN ni contraseñas por correo.' })
  return { to: input.to, subject: `Invitación al equipo de ${input.companyName}`, ...content }
}

export function receiptEmail(input: { to: string; customerName: string; orderNumber: string; lines: Array<{ quantity: number; description: string; totalPyg: number }>; totalPyg: number; trackingUrl: string; companyName?: string }) {
  if (!emailPattern.test(input.to) || !input.orderNumber.trim() || !input.trackingUrl.trim()) return null
  const company = input.companyName?.trim() || 'MobOS'
  const linesHtml = input.lines.map((line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e0e7f0;color:#3a465a;font-size:14px;line-height:1.5">${escapeHtml(String(line.quantity))} × ${escapeHtml(line.description)}</td><td style="padding:10px 0;border-bottom:1px solid #e0e7f0;color:#3a465a;font-size:14px;line-height:1.5;text-align:right;white-space:nowrap">${escapeHtml(formatPyg(line.totalPyg))}</td></tr>`).join('')
  const linesText = input.lines.map((line) => `${line.quantity} × ${line.description} — ${formatPyg(line.totalPyg)}`).join('\n')
  const contentHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-collapse:collapse"><tbody>${linesHtml}</tbody></table><p style="margin:16px 0 0;text-align:right;font-size:17px;font-weight:800;color:#080e1a">Total: ${escapeHtml(formatPyg(input.totalPyg))}</p>`
  const contentText = `${linesText}\nTotal: ${formatPyg(input.totalPyg)}`
  const content = template({ eyebrow: 'Comprobante de compra', title: `Comprobante ${input.orderNumber}`, lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: `Gracias por tu compra en ${company}.`, contentHtml, contentText, action: { label: 'Seguí tu pedido', url: input.trackingUrl }, footer: 'MobOS nunca envía PIN ni contraseñas por este canal.' })
  return { to: input.to, subject: `Comprobante ${input.orderNumber}`, ...content }
}

// Informe de dispositivo (#240 ítem 3): el link público y su respaldo visible.
export function deviceReportEmail(input: { to: string; customerName: string; model: string; link: string; companyName?: string }) {
  if (!emailPattern.test(input.to) || !input.link.trim()) return null
  const company = input.companyName?.trim() || 'MobOS'
  const equipo = input.model.trim() || 'equipo'
  const content = template({
    eyebrow: 'Informe de dispositivo',
    title: `Informe de tu ${equipo}`,
    lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined,
    body: `Acá tenés el informe del ${equipo} que verificamos en ${company}: modelo, estado, batería y garantía.`,
    contentHtml: `<p style="margin:12px 0 0;font-size:13px;color:#3a465a;line-height:1.6">Si el botón no abre, copiá y pegá este enlace en el navegador:<br /><span style="word-break:break-all;color:#080e1a">${escapeHtml(input.link)}</span></p>`,
    contentText: `Enlace del informe: ${input.link}`,
    action: { label: 'Ver el informe', url: input.link },
    footer: 'Informe informativo de la tienda; no es un certificado oficial.',
  })
  return { to: input.to, subject: `Informe de tu ${equipo} · ${company}`, ...content }
}

function formatDateEsPy(value: Date) {
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }).format(value)
}

export function paymentDueReminderEmail(input: { to: string; customerName: string; orderNumber: string; dueAt: Date; amountPyg: number; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.dueAt.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const content = template({ eyebrow: 'Cuota por vencer', title: 'Tu cuota vence pronto', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: `La cuota de tu pedido ${input.orderNumber} en ${store} vence el ${formatDateEsPy(input.dueAt)} por ${formatPyg(input.amountPyg)}.`, footer: 'Pagá antes del vencimiento para mantener tu plan al día.' })
  return { to: input.to, subject: `Tu cuota del pedido ${input.orderNumber} vence pronto`, ...content }
}

export function paymentOverdueEmail(input: { to: string; customerName: string; orderNumber: string; dueAt: Date; amountPyg: number; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.dueAt.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const content = template({ eyebrow: 'Cuota vencida', title: 'Tu cuota está vencida', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: `La cuota de tu pedido ${input.orderNumber} en ${store} venció el ${formatDateEsPy(input.dueAt)} por ${formatPyg(input.amountPyg)}.`, footer: `Acercate a ${store} o respondé este correo para regularizarla.` })
  return { to: input.to, subject: `Tu cuota del pedido ${input.orderNumber} está vencida`, ...content }
}

export function warrantyStatusEmail(input: { to: string; customerName: string; serial: string; storeName: string; statusLabel: string; trackingUrl?: string }) {
  if (!emailPattern.test(input.to) || !input.serial.trim() || !input.statusLabel.trim()) return null
  const store = input.storeName.trim() || 'MobOS'
  const content = template({
    eyebrow: 'Garantía y servicio',
    title: 'Tu equipo cambió de estado',
    lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined,
    body: `El equipo ${input.serial} ahora está: ${input.statusLabel}.`,
    action: input.trackingUrl ? { label: 'Seguí tu caso', url: input.trackingUrl } : undefined,
    footer: `Cualquier consulta, respondé este correo o acercate a ${store}.`,
  })
  return { to: input.to, subject: `Tu equipo ${input.serial} cambió de estado`, ...content }
}

export function reservationDueEmail(input: { to: string; customerName: string; itemLabel: string; reservedUntil: Date; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.reservedUntil.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const content = template({ eyebrow: 'Reserva', title: 'Tu reserva vence pronto', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: `El artículo ${input.itemLabel} está reservado para vos hasta el ${formatDateEsPy(input.reservedUntil)}.`, footer: `Si no lo retirás, la reserva se libera automáticamente. Te esperamos en ${store}.` })
  return { to: input.to, subject: 'Tu reserva vence pronto', ...content }
}
