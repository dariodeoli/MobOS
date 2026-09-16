const TOKEN_PATTERN = /^[a-f0-9]{64}$/i

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
