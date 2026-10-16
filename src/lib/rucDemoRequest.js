import { ApiError } from './api/errors.js'

// Única consulta real admitida en demo. No usa el cliente de la tienda ni
// recibe una ruta elegida por el llamador; nunca adjunta sesión o credenciales.
export async function consultarRucDemoReal(query, { apiUrl, signal, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  if (!/^[1-9]\d{0,8}(?:-\d)?$/.test(String(query || ''))) throw new ApiError('Ingresá un RUC válido.', { code: 'invalid_ruc' })
  if (!apiUrl) throw new ApiError('La consulta RUC no está configurada. Podés completar los datos manualmente.', { code: 'API_NOT_CONFIGURED' })
  const controller = new AbortController()
  let expired = false
  const abort = () => controller.abort()
  const timer = setTimeout(() => { expired = true; controller.abort() }, timeoutMs)
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetchImpl(`${apiUrl.replace(/\/$/, '')}/api/public/ruc?ruc=${encodeURIComponent(query)}`, {
      method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/json' }, signal: controller.signal,
    })
    const payload = await response.json()
    if (controller.signal.aborted) throw new Error('aborted')
    if (!response.ok) {
      const retry = Number(response.headers.get('retry-after'))
      const hint = response.status === 429 && Number.isFinite(retry) && retry > 0 ? ` Reintentá en ${Math.ceil(retry)} s.` : ''
      throw new ApiError(`${payload?.message || 'No se pudo consultar el RUC. Podés completar los datos manualmente.'}${hint}`, {
        status: response.status, code: payload?.code || payload?.details?.code || 'RUC_UNAVAILABLE',
      })
    }
    return payload
  } catch (cause) {
    if (expired) throw new ApiError('La consulta RUC tardó demasiado. Reintentá o completá los datos manualmente.', { code: 'REQUEST_TIMEOUT' })
    if (signal?.aborted) throw new ApiError('La consulta RUC fue cancelada.', { code: 'REQUEST_ABORTED' })
    if (cause instanceof ApiError) throw cause
    throw new ApiError('No se pudo consultar OwnData. Reintentá o completá los datos manualmente.', { code: 'RUC_UNAVAILABLE', cause })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
