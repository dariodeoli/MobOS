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

const EMAIL_VERSION = 'v2.0.0'

function formatPyg(value: number) {
  return `Gs. ${Number(value).toLocaleString('es-PY')}`
}

// Paleta de correo independiente de las preferencias del cliente: cálida,
// sobria y con contraste suficiente para texto normal y acciones.
const COLOR = {
  paper: '#F3F5F1',
  surface: '#FFFFFF',
  border: '#D7E2DA',
  line: '#E4EBE6',
  ink: '#17211B',
  muted: '#4B5F53',
  brand: '#166534',
  onBrand: '#FFFFFF',
  brandSoft: '#E7F2EA',
  brandInk: '#14532D',
  link: '#0B5E43',
}

type EmailTone = 'brand' | 'success' | 'info' | 'warning' | 'danger'

const TONE: Record<EmailTone, { surface: string; border: string; ink: string }> = {
  brand: { surface: COLOR.brandSoft, border: '#BED8C5', ink: COLOR.brandInk },
  success: { surface: '#E7F5EC', border: '#B9DDC6', ink: '#1F6A43' },
  info: { surface: '#EAF1EE', border: '#C8D9D0', ink: '#315B49' },
  warning: { surface: '#FFF3D6', border: '#E7CA86', ink: '#7A4308' },
  danger: { surface: '#FDEBE8', border: '#E8BDB6', ink: '#8B2C22' },
}

function detailCard(rows: Array<{ label: string; value: string }>, ariaLabel: string, tone: EmailTone = 'brand') {
  const colors = TONE[tone]
  const htmlRows = rows.map((row, index) => `<tr><th scope="row" align="left" style="padding:${index === 0 ? '14px' : '10px'} 14px 10px;color:${COLOR.muted};font-size:12px;font-weight:700;line-height:1.45;letter-spacing:.02em;text-transform:uppercase;border-bottom:${index === rows.length - 1 ? '0' : `1px solid ${colors.border}`};vertical-align:top">${escapeHtml(row.label)}</th><td align="right" style="padding:${index === 0 ? '14px' : '10px'} 14px 10px;color:${COLOR.ink};font-size:14px;font-weight:700;line-height:1.45;border-bottom:${index === rows.length - 1 ? '0' : `1px solid ${colors.border}`};vertical-align:top">${escapeHtml(row.value)}</td></tr>`).join('')
  return {
    html: `<table role="table" aria-label="${escapeHtml(ariaLabel)}" width="100%" cellpadding="0" cellspacing="0" class="email-detail" style="margin:20px 0 0;background:${colors.surface};border:1px solid ${colors.border};border-radius:12px;border-collapse:separate"><tbody>${htmlRows}</tbody></table>`,
    text: rows.map((row) => `${row.label}: ${row.value}`).join('\n'),
  }
}

function template(input: { eyebrow: string; title: string; body: string; lead?: string; action?: { label: string; url: string }; footer: string; contentHtml?: string; contentText?: string; tone?: EmailTone }) {
  const tone = input.tone || 'brand'
  const toneColors = TONE[tone]
  const leadText = input.lead ? `${input.lead}\n\n` : ''
  const contentText = input.contentText ? `\n\n${input.contentText}` : ''
  const actionText = input.action ? `\n\n${input.action.label}: ${input.action.url}` : ''
  const text = `${input.title}\n${input.eyebrow}\n\n${leadText}${input.body}${contentText}${actionText}\n\n${input.footer}\n\nMobOS · app.moboss.online · Email ${EMAIL_VERSION}`
  const leadHtml = input.lead
    ? `<p class="email-text" style="margin:0 0 12px;color:${COLOR.ink};font-size:15px;font-weight:700;line-height:1.6">${escapeHtml(input.lead)}</p>`
    : ''
  // El botón siempre conserva un enlace visible y copiable como alternativa.
  const actionHtml = input.action
    ? `<table role="presentation" class="email-cta" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-collapse:separate"><tbody><tr><td bgcolor="${COLOR.brand}" style="border-radius:10px;background:${COLOR.brand};mso-padding-alt:13px 24px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:13px 24px;color:${COLOR.onBrand};font-size:15px;font-weight:700;line-height:20px;text-align:center;text-decoration:none;border-radius:10px">${escapeHtml(input.action.label)}</a></td></tr></tbody></table><p class="email-muted" style="margin:13px 0 0;color:${COLOR.muted};font-size:13px;line-height:1.6">Si el botón no funciona, copiá y pegá este enlace:<br><a class="email-link" href="${escapeHtml(input.action.url)}" style="color:${COLOR.link};font-weight:600;text-decoration:underline;word-break:break-all">${escapeHtml(input.action.url)}</a></p>`
    : ''
  const preheader = `<div class="email-preheader" style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(input.eyebrow)} · ${escapeHtml(input.title)}&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>`
  // contentHtml es HTML de confianza interna: quien lo provee ya escapó su entrada.
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(input.title)}</title><style>html,body{margin:0!important;padding:0!important;width:100%!important}table,td{mso-table-lspace:0;mso-table-rspace:0}a{text-decoration-skip-ink:auto}@media only screen and (max-width:620px){.email-frame{padding:16px 10px!important}.email-shell{width:100%!important;max-width:100%!important}.email-brand-pad{padding:22px 20px 0!important}.email-pad{padding:22px 20px 26px!important}.email-brand-cell,.email-badge-cell{display:block!important;width:100%!important;text-align:left!important}.email-badge-cell{padding-top:14px!important}.email-cta,.email-cta tbody,.email-cta tr,.email-cta td{width:100%!important}.email-cta a{display:block!important;text-align:center!important}.receipt-table th,.receipt-table td{font-size:12px!important}}@media (prefers-color-scheme:dark){.email-bg{background:#101713!important}.email-card{background:#17211B!important;border-color:#3A4A40!important}.email-text{color:#F3F7F4!important}.email-muted{color:#C0CEC5!important}.email-rule{border-color:#3A4A40!important}.email-badge{background:#244C34!important;border-color:#46735A!important;color:#D8F5E1!important}.email-link{color:#8ED5AD!important}.email-detail{background:#1E2B24!important;border-color:#3A4A40!important}.email-detail th{color:#C0CEC5!important}.email-detail td{color:#F3F7F4!important}[data-tone="warning"] .email-badge{background:#4A3515!important;border-color:#7C5A24!important;color:#FFE4A3!important}[data-tone="danger"] .email-badge{background:#4D2522!important;border-color:#82423C!important;color:#FFD5CF!important}[data-tone="info"] .email-badge{background:#203D35!important;border-color:#41675B!important;color:#D4EEE5!important}}[data-ogsc] .email-bg{background:#101713!important}[data-ogsc] .email-card{background:#17211B!important;border-color:#3A4A40!important}[data-ogsc] .email-text{color:#F3F7F4!important}[data-ogsc] .email-muted{color:#C0CEC5!important}[data-ogsc] .email-link{color:#8ED5AD!important}</style></head><body class="email-bg" style="margin:0;padding:0;background:${COLOR.paper};color:${COLOR.ink};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%"><div role="article" aria-roledescription="email" aria-label="${escapeHtml(input.title)}" data-email-system="mobos-premium" data-email-version="${EMAIL_VERSION}" data-tone="${tone}">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="width:100%;background:${COLOR.paper};border-collapse:collapse"><tbody><tr><td align="center" class="email-frame" style="padding:28px 16px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" class="email-shell email-card" style="width:600px;max-width:600px;background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;border-collapse:separate;overflow:hidden"><tbody><tr><td class="email-brand-pad" style="padding:26px 32px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tbody><tr><td class="email-brand-cell" valign="middle"><p class="email-text" style="margin:0;color:${COLOR.ink};font-size:20px;font-weight:800;line-height:1;letter-spacing:-.03em">Mob<span style="color:${COLOR.brand}">OS</span></p><p class="email-muted" style="margin:7px 0 0;color:${COLOR.muted};font-size:12px;font-weight:600;line-height:1.4">Gestión comercial, clara y segura</p></td><td class="email-badge-cell" align="right" valign="middle"><span class="email-badge" style="display:inline-block;padding:7px 10px;background:${toneColors.surface};border:1px solid ${toneColors.border};border-radius:999px;color:${toneColors.ink};font-size:11px;font-weight:800;line-height:1.2;letter-spacing:.06em;text-transform:uppercase">${escapeHtml(input.eyebrow)}</span></td></tr></tbody></table></td></tr><tr><td class="email-pad" style="padding:26px 32px 32px"><h1 class="email-text" style="margin:0 0 14px;color:${COLOR.ink};font-size:26px;font-weight:800;line-height:1.22;letter-spacing:-.02em">${escapeHtml(input.title)}</h1>${leadHtml}<p class="email-muted" style="margin:0;color:${COLOR.muted};font-size:15px;line-height:1.7">${escapeHtml(input.body)}</p>${input.contentHtml || ''}${actionHtml}<p class="email-muted email-rule" style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${COLOR.line};color:${COLOR.muted};font-size:13px;line-height:1.65">${escapeHtml(input.footer)}</p></td></tr></tbody></table><p class="email-muted" style="margin:14px 0 0;color:${COLOR.muted};font-size:12px;line-height:1.5;text-align:center">MobOS · app.moboss.online · Email ${EMAIL_VERSION}</p></td></tr></tbody></table></div></body></html>`
  return { html, text }
}

export function passwordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/restablecer-contrasena', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const details = detailCard([{ label: 'Cuenta', value: input.companyName }, { label: 'Validez', value: '30 minutos' }, { label: 'Uso', value: 'Una sola vez' }], 'Detalles de seguridad', 'info')
  const content = template({ eyebrow: 'Seguridad de la cuenta', title: 'Recuperá tu contraseña', body: `Recibimos una solicitud para recuperar la contraseña de tu cuenta en ${input.companyName}.`, contentHtml: details.html, contentText: details.text, action: { label: 'Restablecer contraseña', url: link }, footer: 'Si no fuiste vos, ignorá este correo. Tu contraseña actual no cambia hasta que completes el proceso.', tone: 'info' })
  return { to: input.to, subject: `Recuperá tu contraseña de ${input.companyName}`, ...content }
}

export function emailVerificationEmail(input: { to: string; companyName: string; token: string }) {
  const link = actionLink('/verificar-correo', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const details = detailCard([{ label: 'Cuenta', value: input.companyName }, { label: 'Validez', value: '60 minutos' }, { label: 'Uso', value: 'Una sola vez' }], 'Detalles de verificación', 'info')
  const content = template({ eyebrow: 'Confirmación de correo', title: 'Verificá tu correo', body: `Confirmá que este correo pertenece a tu cuenta de ${input.companyName}. Podés seguir usando MobOS mientras tanto.`, contentHtml: details.html, contentText: details.text, action: { label: 'Verificar correo', url: link }, footer: 'Si no solicitaste esta verificación, podés ignorar el mensaje.', tone: 'info' })
  return { to: input.to, subject: 'Verificá tu correo de MobOS', ...content }
}

export function welcomeEmail(input: { to: string; companyName: string; tenantId: string }) {
  const link = actionLink('/login')
  if (!link || !emailPattern.test(input.to)) return null
  const details = detailCard([{ label: 'Empresa', value: input.companyName }, { label: 'Espacio', value: 'Ventas, inventario y equipo' }], 'Resumen de la cuenta', 'success')
  const content = template({ eyebrow: 'Tu tienda está lista', title: 'Te damos la bienvenida a MobOS', body: `${input.companyName} ya puede organizar ventas, inventario y equipo desde un solo lugar.`, contentHtml: details.html, contentText: details.text, action: { label: 'Abrir MobOS', url: link }, footer: 'Este mensaje no contiene contraseñas ni PIN de acceso.', tone: 'success' })
  return { to: input.to, subject: 'Tu tienda ya está en MobOS', ...content }
}

export function teamInvitationEmail(input: { to: string; inviteeName: string; companyName: string; inviterName: string; token: string; invitationId: string }) {
  const link = actionLink('/aceptar-invitacion', input.token)
  if (!link || !emailPattern.test(input.to)) return null
  const details = detailCard([{ label: 'Empresa', value: input.companyName }, { label: 'Invita', value: input.inviterName }, { label: 'Validez', value: '7 días' }], 'Detalles de la invitación', 'brand')
  const content = template({ eyebrow: 'Invitación al equipo', title: `Te invitaron a ${input.companyName}`, lead: input.inviteeName.trim() ? `Hola ${input.inviteeName},` : undefined, body: `${input.inviterName} te invitó a trabajar con el equipo en MobOS. Al aceptar, vas a elegir tu propio PIN de 4 dígitos.`, contentHtml: details.html, contentText: details.text, action: { label: 'Aceptar invitación', url: link }, footer: 'MobOS nunca envía PIN ni contraseñas por correo.' })
  return { to: input.to, subject: `Invitación al equipo de ${input.companyName}`, ...content }
}

export function receiptEmail(input: { to: string; customerName: string; orderNumber: string; lines: Array<{ quantity: number; description: string; totalPyg: number }>; totalPyg: number; trackingUrl: string; companyName?: string }) {
  if (!emailPattern.test(input.to) || !input.orderNumber.trim() || !input.trackingUrl.trim()) return null
  const company = input.companyName?.trim() || 'MobOS'
  const linesHtml = input.lines.map((line) => `<tr><td class="email-muted" style="padding:11px 12px;border-bottom:1px solid ${COLOR.line};color:${COLOR.muted};font-size:14px;line-height:1.45">${escapeHtml(String(line.quantity))} × ${escapeHtml(line.description)}</td><td class="email-text" align="right" style="padding:11px 12px;border-bottom:1px solid ${COLOR.line};color:${COLOR.ink};font-size:14px;font-weight:700;line-height:1.45;white-space:nowrap">${escapeHtml(formatPyg(line.totalPyg))}</td></tr>`).join('')
  const linesText = input.lines.map((line) => `${line.quantity} × ${line.description} — ${formatPyg(line.totalPyg)}`).join('\n')
  const contentHtml = `<table role="table" aria-label="Detalle del comprobante" width="100%" cellpadding="0" cellspacing="0" class="receipt-table email-detail" style="margin:20px 0 0;background:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:12px;border-collapse:separate;overflow:hidden"><thead><tr><th scope="col" align="left" style="padding:10px 12px;background:${COLOR.brandSoft};color:${COLOR.brandInk};font-size:11px;line-height:1.4;letter-spacing:.06em;text-transform:uppercase">Detalle</th><th scope="col" align="right" style="padding:10px 12px;background:${COLOR.brandSoft};color:${COLOR.brandInk};font-size:11px;line-height:1.4;letter-spacing:.06em;text-transform:uppercase">Importe</th></tr></thead><tbody>${linesHtml}<tr><th scope="row" align="right" style="padding:13px 12px;color:${COLOR.ink};font-size:14px;line-height:1.45">Total</th><td align="right" style="padding:13px 12px;color:${COLOR.ink};font-size:17px;font-weight:800;line-height:1.45;white-space:nowrap">${escapeHtml(formatPyg(input.totalPyg))}</td></tr></tbody></table>`
  const contentText = `Pedido: ${input.orderNumber}\n${linesText}\nTotal: ${formatPyg(input.totalPyg)}`
  const content = template({ eyebrow: 'Comprobante de compra', title: `Comprobante ${input.orderNumber}`, lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: `Gracias por tu compra en ${company}.`, contentHtml, contentText, action: { label: 'Seguí tu pedido', url: input.trackingUrl }, footer: 'Conservá este comprobante para consultar los datos de tu compra.', tone: 'success' })
  return { to: input.to, subject: `Comprobante ${input.orderNumber}`, ...content }
}

// Informe de dispositivo (#240 ítem 3): el link público y su respaldo visible.
export function deviceReportEmail(input: { to: string; customerName: string; model: string; link: string; companyName?: string }) {
  if (!emailPattern.test(input.to) || !input.link.trim()) return null
  const company = input.companyName?.trim() || 'MobOS'
  const equipo = input.model.trim() || 'equipo'
  const details = detailCard([{ label: 'Equipo', value: equipo }, { label: 'Tienda', value: company }, { label: 'Contenido', value: 'Estado, batería y garantía' }], 'Resumen del informe', 'info')
  const content = template({
    eyebrow: 'Informe de dispositivo',
    title: `Informe de tu ${equipo}`,
    lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined,
    body: `Acá tenés el informe del ${equipo} que verificamos en ${company}: modelo, estado, batería y garantía.`,
    contentHtml: details.html,
    contentText: `${details.text}\nEnlace del informe: ${input.link}`,
    action: { label: 'Ver el informe', url: input.link },
    footer: 'Informe informativo de la tienda; no es un certificado oficial.',
    tone: 'info',
  })
  return { to: input.to, subject: `Informe de tu ${equipo} · ${company}`, ...content }
}

function formatDateEsPy(value: Date) {
  return new Intl.DateTimeFormat('es-PY', { day: '2-digit', month: 'long', year: 'numeric' }).format(value)
}

export function paymentDueReminderEmail(input: { to: string; customerName: string; orderNumber: string; dueAt: Date; amountPyg: number; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.dueAt.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const details = detailCard([{ label: 'Pedido', value: input.orderNumber }, { label: 'Vencimiento', value: formatDateEsPy(input.dueAt) }, { label: 'Importe', value: formatPyg(input.amountPyg) }, { label: 'Comercio', value: store }], 'Detalle de la cuota', 'warning')
  const content = template({ eyebrow: 'Cuota por vencer', title: 'Tu cuota vence pronto', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: 'Te recordamos los datos de tu próxima cuota.', contentHtml: details.html, contentText: details.text, footer: 'Pagá antes del vencimiento para mantener tu plan al día.', tone: 'warning' })
  return { to: input.to, subject: `Tu cuota del pedido ${input.orderNumber} vence pronto`, ...content }
}

export function paymentOverdueEmail(input: { to: string; customerName: string; orderNumber: string; dueAt: Date; amountPyg: number; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.dueAt.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const details = detailCard([{ label: 'Pedido', value: input.orderNumber }, { label: 'Venció', value: formatDateEsPy(input.dueAt) }, { label: 'Importe', value: formatPyg(input.amountPyg) }, { label: 'Comercio', value: store }], 'Detalle de la cuota vencida', 'danger')
  const content = template({ eyebrow: 'Cuota vencida', title: 'Tu cuota está vencida', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: 'Esta cuota figura pendiente de regularización.', contentHtml: details.html, contentText: details.text, footer: `Acercate a ${store} o respondé este correo para regularizarla.`, tone: 'danger' })
  return { to: input.to, subject: `Tu cuota del pedido ${input.orderNumber} está vencida`, ...content }
}

export function warrantyStatusEmail(input: { to: string; customerName: string; serial: string; storeName: string; statusLabel: string; trackingUrl?: string }) {
  if (!emailPattern.test(input.to) || !input.serial.trim() || !input.statusLabel.trim()) return null
  const store = input.storeName.trim() || 'MobOS'
  const details = detailCard([{ label: 'Equipo', value: input.serial }, { label: 'Estado', value: input.statusLabel }, { label: 'Comercio', value: store }], 'Estado de garantía y servicio', 'info')
  const content = template({
    eyebrow: 'Garantía y servicio',
    title: 'Tu equipo cambió de estado',
    lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined,
    body: 'Actualizamos el estado de tu equipo.',
    contentHtml: details.html,
    contentText: details.text,
    action: input.trackingUrl ? { label: 'Seguí tu caso', url: input.trackingUrl } : undefined,
    footer: `Cualquier consulta, respondé este correo o acercate a ${store}.`,
    tone: 'info',
  })
  return { to: input.to, subject: `Tu equipo ${input.serial} cambió de estado`, ...content }
}

export function reservationDueEmail(input: { to: string; customerName: string; itemLabel: string; reservedUntil: Date; storeName: string }) {
  if (!emailPattern.test(input.to) || !Number.isFinite(input.reservedUntil.getTime())) return null
  const store = input.storeName.trim() || 'MobOS'
  const details = detailCard([{ label: 'Artículo', value: input.itemLabel }, { label: 'Reservado hasta', value: formatDateEsPy(input.reservedUntil) }, { label: 'Comercio', value: store }], 'Detalle de la reserva', 'warning')
  const content = template({ eyebrow: 'Reserva', title: 'Tu reserva vence pronto', lead: input.customerName.trim() ? `Hola ${input.customerName},` : undefined, body: 'Tu artículo sigue reservado y está próximo a liberarse.', contentHtml: details.html, contentText: details.text, footer: `Si no lo retirás, la reserva se libera automáticamente. Te esperamos en ${store}.`, tone: 'warning' })
  return { to: input.to, subject: 'Tu reserva vence pronto', ...content }
}
