const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
  return Boolean(process.env.RESEND_API_KEY && process.env.MOBOS_EMAIL_FROM && appUrl())
}

export async function sendPasswordRecoveryEmail(input: { to: string; companyName: string; token: string }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MOBOS_EMAIL_FROM
  const origin = appUrl()
  if (!apiKey || !from || !origin || !emailPattern.test(input.to)) return false
  const link = new URL('/restablecer-contrasena', origin)
  link.searchParams.set('token', input.token)
  const text = `Hola. Recibimos una solicitud para restablecer la contraseña de ${input.companyName}. Usá este enlace dentro de 30 minutos: ${link.toString()} Si no fuiste vos, ignorá este correo.`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [input.to], subject: `Restablecé tu contraseña de ${input.companyName}`, text }),
  })
  return response.ok
}
