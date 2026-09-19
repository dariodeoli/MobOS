const TOKEN_PATTERN = /^[a-f0-9]{64}$/i
// Rutas de la app que llevan token en el path. El tracker del relay de correo
// envuelve la dirección y puede dejar el token pegado a un `%2F`: decodificar
// primero y buscar después de la ruta evita extraer un token corrido.
const RUTA_CON_TOKEN = /\/(aceptar-invitacion|restablecer-contrasena|verificar-correo)\/([a-f0-9]{64})/i

// Extrae el token de acción de un enlace completo pegado (incluido el enlace
// de tracking de los relays de correo). Devuelve '' si no encuentra ninguno.
export function extractTokenFromUrl(raw = '') {
  const texto = (() => { try { return decodeURIComponent(String(raw)) } catch { return String(raw) } })()
  const porRuta = texto.match(RUTA_CON_TOKEN)
  if (porRuta) return porRuta[2]
  const match = texto.match(/[a-f0-9]{64}/i)
  return match ? match[0] : ''
}

// El token de acción viaja en el PATH (/aceptar-invitacion/<token>), inmune a
// los redirects de tracking de los relays de correo. Se mantiene la
// compatibilidad con el fragmento (#token=...) y con el query legacy
// (?token=...), y siempre se limpia la URL de inmediato para no filtrarlo.
export function consumeActionToken(location = window.location, history = window.history) {
  const pathMatch = String(location.pathname || '').match(/\/([a-f0-9]{64})(?:\/)?$/i)
  const fragment = new URLSearchParams(String(location.hash || '').replace(/^#/, ''))
  const query = new URLSearchParams(location.search || '')
  const legacyToken = query.get('token') || ''
  const token = pathMatch?.[1] || fragment.get('token') || legacyToken
  const hadSensitiveUrlState = Boolean(pathMatch) || Boolean(location.hash) || Boolean(legacyToken)
  query.delete('token')
  if (hadSensitiveUrlState) {
    const search = query.toString()
    const cleanPath = pathMatch ? location.pathname.replace(/\/[a-f0-9]{64}\/?$/i, '/') : location.pathname
    history.replaceState(history.state, '', `${cleanPath}${search ? `?${search}` : ''}`)
  }
  return TOKEN_PATTERN.test(token) ? token : ''
}
