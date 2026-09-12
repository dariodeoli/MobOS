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
  const raw = process.env.MOBOS_APP_URL || 'https://app.moboss.online'
  try {
    const url = new URL(raw)
    const localhost = process.env.NODE_ENV !== 'production' && url.hostname === 'localhost'
    if ((url.protocol !== 'https:' && !localhost) || url.username || url.password || url.search || url.hash) return null
    return url.origin
  } catch { return null }
}

export function recoveryEmailReady() {
  return Boolean(relayUrl() && relayToken() && appUrl())
}

export async function sendTransactionalEmail(input: { to: string; subject: string; html: string; text?: string; idempotencyKey?: string }) {
  const endpoint = relayUrl()
  const token = relayToken()
  if (!endpoint || !token || !emailPattern.test(input.to) || !input.subject.trim() || !input.html.trim()) return false
  const headers: Record<string, string> = { 'X-WEEM-RELAY-TOKEN': token, 'Content-Type': 'application/json' }
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey.slice(0, 180)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ project: relayProject, to: [input.to], subject: input.subject, html: input.html, ...(input.text ? { text: input.text } : {}) }),
    })
    return response.ok
  } catch { return false }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function sendPasswordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const origin = appUrl()
  if (!origin || !emailPattern.test(input.to)) return false
  const link = new URL('/restablecer-contrasena', origin)
  link.searchParams.set('token', input.token)
  const text = `Hola. Recibimos una solicitud para restablecer la contraseña de ${input.companyName}. Usá este enlace dentro de 30 minutos: ${link.toString()} Si no fuiste vos, ignorá este correo.`
  const safeName = escapeHtml(input.companyName)
  const safeLink = escapeHtml(link.toString())
  return sendTransactionalEmail({
    to: input.to,
    subject: `Restablecé tu contraseña de ${input.companyName}`,
    text,
    idempotencyKey: `mobos-password-recovery-${input.token.slice(0, 24)}`,
    html: `<!doctype html><html lang="es"><body><h1>Restablecé tu contraseña</h1><p>Recibimos una solicitud para la cuenta de <strong>${safeName}</strong>.</p><p><a href="${safeLink}">Restablecer contraseña</a></p><p>Este enlace vence en 30 minutos. Si no fuiste vos, ignorá este correo.</p></body></html>`,
  })
}
