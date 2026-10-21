// Sondeo opcional compartido: no descubrir localhost en pantallas de negocio.
// La detección manual ignora el enfriamiento; varios consumidores comparten
// la petición en curso. El contexto evita reutilizar salud entre empresas.
export function crearConsultaEstadoAgente({ fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  let cache = null
  let pendiente = null
  return async function consultar(config, { forzar = false, accionExplicita = false, contexto = 0 } = {}) {
    const { url, token, impresora } = config
    if (!forzar && !accionExplicita && !token && !impresora) return { disponible: false }
    const clave = JSON.stringify([contexto, url, token])
    // Una impresión pedida por la persona debe detectar un agente recién iniciado.
    if (!forzar && cache?.clave === clave && now() < cache.hasta
      && !(accionExplicita && cache.estado.disponible === false)) return cache.estado
    if (pendiente?.clave === clave) return pendiente.promesa
    const promesa = (async () => {
      const control = new AbortController()
      const timer = setTimeout(() => control.abort(), 1200)
      let estado
      try {
        const respuesta = await fetchImpl(`${url}/health`, { signal: control.signal, headers: token ? { 'x-mobos-print-token': token } : {} })
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const datos = await respuesta.json()
        estado = { ...datos, disponible: datos?.ok === true }
      } catch {
        estado = { disponible: false }
      } finally {
        clearTimeout(timer)
      }
      cache = { clave, estado, hasta: now() + (estado.disponible ? 5000 : 60_000) }
      return estado
    })()
    const actual = { clave, promesa }
    pendiente = actual
    try { return await promesa } finally { if (pendiente === actual) pendiente = null }
  }
}
