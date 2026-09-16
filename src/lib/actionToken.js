const TOKEN_PATTERN = /^[a-f0-9]{64}$/i

// El token de acción vive en el fragmento (#token=...) y se limpia de la
// historia. Los correos legacy (v1.0.2 y anteriores) lo enviaban en query
// (?token=...): se acepta solo como compatibilidad en estas páginas de acción
// y se elimina de la URL de inmediato para no filtrarlo en logs futuros.
export function consumeActionToken(location = window.location, history = window.history) {
  const fragment = new URLSearchParams(String(location.hash || '').replace(/^#/, ''))
  const query = new URLSearchParams(location.search || '')
  const legacyToken = query.get('token') || ''
  const token = fragment.get('token') || legacyToken
  const hadSensitiveUrlState = Boolean(location.hash) || Boolean(legacyToken)
  query.delete('token')
  if (hadSensitiveUrlState) {
    const search = query.toString()
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}`)
  }
  return TOKEN_PATTERN.test(token) ? token : ''
}
