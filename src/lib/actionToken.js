const TOKEN_PATTERN = /^[a-f0-9]{64}$/i

export function consumeActionToken(location = window.location, history = window.history) {
  const fragment = new URLSearchParams(String(location.hash || '').replace(/^#/, ''))
  const token = fragment.get('token') || ''
  const query = new URLSearchParams(location.search || '')
  const hadSensitiveUrlState = Boolean(location.hash) || query.has('token')
  query.delete('token')
  if (hadSensitiveUrlState) {
    const search = query.toString()
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}`)
  }
  return TOKEN_PATTERN.test(token) ? token : ''
}
