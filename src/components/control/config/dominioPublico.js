// #422 · Dominios de correo gratuitos: un remitente de ese dominio no se puede
// personalizar (los proveedores rechazan o marcan como spam los correos que
// otra plataforma envía «a nombre» de gmail.com, outlook.com, etc.).
const DOMINIOS_PUBLICOS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'gmx.net', 'zoho.com', 'mail.com', 'yandex.com',
])

export function dominioDeCorreo(correo) {
  const texto = String(correo || '').trim().toLowerCase()
  const arroba = texto.lastIndexOf('@')
  return arroba > 0 ? texto.slice(arroba + 1) : ''
}

export function esDominioPublico(correo) {
  return DOMINIOS_PUBLICOS.has(dominioDeCorreo(correo))
}
