// Only this authenticated lookup can report a provider credential failure without
// invalidating MobOS private state. A session failure never carries this marker.
export function isOwnDataCredentialError(path, method, status, payload) {
  if (method !== 'GET' || ![401, 403].includes(status) || typeof path !== 'string'
    || !/^\/api\/ruc(?:\?|$)/.test(path) || path.split('?')[0] !== '/api/ruc'
    || payload?.details?.provider !== 'OwnData') return false
  const codes = status === 401
    ? ['API_KEY_REQUIRED', 'API_KEY_INVALID', 'API_KEY_REVOKED', 'API_KEY_EXPIRED', 'API_KEY_ENVIRONMENT_MISMATCH']
    : ['INSUFFICIENT_SCOPE', 'PLAN_REQUIRED']
  return codes.includes(payload.details.code)
}

export async function readRucErrorBody(response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0, text = '', timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => {}); reject(new Error('RUC response timeout')) }, 8000) })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      bytes += value.byteLength
      if (bytes > 65536) throw new Error('RUC response too large')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
