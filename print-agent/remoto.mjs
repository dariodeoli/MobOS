// Poller remoto del puente de impresión: reporta los resultados que quedaron
// pendientes, reclama trabajos con lease, los imprime con los transportes del
// agente y reporta el estado al backend. La cola local manda: este módulo
// nunca imprime trabajos locales ni bloquea el camino 127.0.0.1.
const TIMEOUT_MS = 15000
const LATIDO_MS = 45000
const CONFIG_CADA_MS = 60000

// Backoff exponencial 2→4→8→16→30 s con jitter ±20 % (decisión 5).
export function calcularBackoff(fallos, baseMs = 2000, maxMs = 30000, azar = Math.random) {
  const crudo = Math.min(maxMs, baseMs * 2 ** Math.max(0, fallos - 1))
  const factor = 0.8 + azar() * 0.4
  return Math.max(100, Math.min(maxMs, Math.round(crudo * factor)))
}

// Canjea el código de vinculación (un solo uso, formato ABCDE-FGHIJ) por el
// token del puente. El token nunca se registra ni se devuelve en los logs.
export async function canjearCodigo({ apiUrl, code, version = '', platform = '', fetchImpl = fetch }) {
  const base = String(apiUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('Falta la dirección del backend para vincular el puente.')
  if (!code) throw new Error('Falta el código de vinculación.')
  const respuesta = await fetchImpl(`${base}/api/print/bridge/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, version, platform }),
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(datos?.error || `El backend respondió ${respuesta.status}.`)
  if (!datos?.token) throw new Error('El backend no devolvió el token del puente.')
  return { token: String(datos.token), bridgeId: String(datos.bridgeId || '') }
}

// Config del backend → config local del agente (impresora, ancho, copias,
// allow-list LAN y cola CUPS). Lo ausente conserva el valor actual: el backend
// manda, pero un backend caído no rompe la impresión local.
export function aplicarConfigRemota(config, datos) {
  if (!datos || typeof datos !== 'object') return config
  if (typeof datos.impresora === 'string') config.impresora = datos.impresora
  if (datos.ancho === 58 || datos.ancho === 80) config.ancho = datos.ancho
  if (datos.copias !== undefined && datos.copias !== null && datos.copias !== '') {
    config.copias = Math.min(5, Math.max(1, Number(datos.copias) || 1))
  }
  if (Array.isArray(datos.lan)) config.lan = datos.lan.map(String).filter(Boolean)
  if (typeof datos.lanCups === 'string' && datos.lanCups.trim()) config.lanCups = datos.lanCups.trim()
  return config
}

export function crearRemoto({
  apiUrl,
  token,
  cola,
  enviar,
  fetchImpl = fetch,
  log = () => {},
  baseMs = 2000,
  maxMs = 30000,
  latidoMs = LATIDO_MS,
  version = '',
  plataforma = process.platform,
}) {
  const raiz = String(apiUrl || '').replace(/\/+$/, '')
  let iniciado = false
  let timer = null
  let fallos = 0
  let backoff = 0
  let ultimoContacto = null
  let ultimoError = ''
  let configSincronizadaEn = 0
  let aplicarConfig = () => {}

  const mensaje = (error) => (error?.message || String(error)).replace(/\s+/g, ' ').slice(0, 200)

  const pedir = async (ruta, { method = 'GET', body = null } = {}) => {
    const respuesta = await fetchImpl(`${raiz}${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const datos = await respuesta.json().catch(() => ({}))
    // Cualquier respuesta HTTP cuenta como contacto, aunque sea un error.
    ultimoContacto = new Date().toISOString()
    if (!respuesta.ok) {
      const error = new Error(datos?.error || `${ruta} respondió ${respuesta.status}.`)
      error.status = respuesta.status
      throw error
    }
    return datos
  }

  // Reporte idempotente: el backend responde el estado actual si el trabajo ya
  // cerró (reconciliación) y acá se vacía el outbox igual. Un 404 significa que
  // el backend ya no conoce el trabajo: se descarta para no bloquear la cola.
  const reportar = async (pendiente) => {
    let descartado = false
    try {
      await pedir(`/api/print/bridge/jobs/${encodeURIComponent(pendiente.id)}/result`, {
        method: 'POST',
        body: {
          leaseId: pendiente.leaseId,
          state: pendiente.resultado,
          ...(pendiente.error ? { error: pendiente.error } : {}),
          ...(pendiente.transporte ? { transport: pendiente.transporte } : {}),
        },
      })
    } catch (error) {
      if (error?.status !== 404) throw error
      descartado = true
      log(`el backend no conoce el trabajo ${pendiente.id}: se descarta del outbox`)
    }
    cola.marcarReportado(pendiente.id)
    if (!descartado) log(`reportado ${pendiente.id}: ${pendiente.resultado}`)
  }

  const reportarPendientes = async () => {
    // Reporta antes de reclamar: si el backend no responde, no se acumulan
    // trabajos reclamados sin resultado.
    for (const pendiente of cola.pendientesDeReporte()) {
      if (!iniciado) return
      await reportar(pendiente)
    }
  }

  const reclamar = async () => {
    const datos = await pedir('/api/print/bridge/claim', { method: 'POST', body: { capacity: 1 } })
    return Array.isArray(datos?.jobs) ? datos.jobs : []
  }

  const latir = async (jobId) => {
    try {
      await pedir('/api/print/bridge/heartbeat', { method: 'POST', body: { version, platform: plataforma, jobId } })
    } catch (error) {
      // El latido no bloquea la impresión: el lease se revalida en el próximo.
      log(`latido sin respuesta para ${jobId}: ${mensaje(error)}`)
    }
  }

  // Reporte inmediato tras imprimir (best-effort): si el backend no responde,
  // el resultado queda en el outbox y se reintenta en el próximo ciclo.
  const reportarUno = async (id) => {
    const pendiente = cola.pendientesDeReporte().find((item) => item.id === id)
    if (!pendiente) return
    try {
      await reportar(pendiente)
    } catch (error) {
      log(`no se pudo reportar ${id} todavía: ${mensaje(error)}`)
    }
  }

  const imprimir = async (job) => {
    const alta = cola.encolarRemoto(job)
    if (!alta.encolado) {
      log(`trabajo ${job.id} ya conocido: no se reimprime`)
      return
    }
    const payload = String(job.payload || '')
    if (!payload) {
      cola.resultadoRemoto(job.id, { estado: 'FALLIDO', error: 'El trabajo llegó sin payload.' })
      await reportarUno(job.id)
      return
    }
    const copias = Math.min(5, Math.max(1, Number(job.copies) || 1))
    const latido = setInterval(() => { latir(job.id) }, latidoMs)
    if (latido.unref) latido.unref()
    try {
      let transporte = ''
      for (let copia = 0; copia < copias; copia += 1) {
        transporte = await enviar(job.destination, Buffer.from(payload, 'base64'))
      }
      cola.resultadoRemoto(job.id, { estado: 'ACEPTADO', transporte: transporte || '' })
      log(`impreso remoto ${job.id} en ${job.destination}`)
    } catch (error) {
      cola.resultadoRemoto(job.id, {
        estado: error?.incierto ? 'INCIERTO' : 'FALLIDO',
        error: mensaje(error),
      })
      log(`error remoto ${job.id}: ${mensaje(error)}`)
    } finally {
      clearInterval(latido)
    }
    await reportarUno(job.id)
  }

  const sincronizarConfig = async (aplicar) => {
    const datos = await pedir('/api/print/bridge/config')
    if (typeof aplicar === 'function') aplicar(datos)
    return datos
  }

  const atender = async () => {
    await reportarPendientes()
    if (!iniciado) return
    const trabajos = await reclamar()
    for (const trabajo of trabajos) {
      if (!iniciado) return
      await imprimir(trabajo)
    }
    if (Date.now() - configSincronizadaEn >= CONFIG_CADA_MS) {
      try {
        await sincronizarConfig(aplicarConfig)
        configSincronizadaEn = Date.now()
      } catch (error) {
        // El claim ya probó contacto: un fallo de config no fuerza backoff.
        log(`no se pudo sincronizar la configuración: ${mensaje(error)}`)
      }
    }
  }

  const programar = (ms) => {
    if (!iniciado) return
    timer = setTimeout(async () => {
      timer = null
      try {
        await atender()
        fallos = 0
        backoff = 0
      } catch (error) {
        fallos += 1
        backoff = calcularBackoff(fallos, baseMs, maxMs)
        ultimoError = mensaje(error)
        log(`sin contacto con el backend (${fallos}): ${ultimoError}`)
      }
      programar(backoff || baseMs)
    }, ms)
    if (timer.unref) timer.unref()
  }

  return {
    async iniciar(aplicar) {
      iniciado = true
      if (typeof aplicar === 'function') aplicarConfig = aplicar
      // Un reinicio con un trabajo reclamado sin resultado se reporta incierto:
      // los bytes pudieron salir y nunca se reimprime solo.
      const reconciliados = cola.reconciliarRemotos()
      if (reconciliados) log(`${reconciliados} trabajo(s) reclamados durante un reinicio: se reportan inciertos`)
      if (timer) { clearTimeout(timer); timer = null }
      try {
        await atender()
        fallos = 0
        backoff = 0
      } catch (error) {
        fallos += 1
        backoff = calcularBackoff(fallos, baseMs, maxMs)
        ultimoError = mensaje(error)
        log(`sin contacto con el backend: ${ultimoError}`)
      }
      programar(backoff || baseMs)
    },
    detener() {
      iniciado = false
      if (timer) { clearTimeout(timer); timer = null }
    },
    sincronizarConfig,
    pendientesDeReporte: () => cola.pendientesDeReporte(),
    atender,
    estado: () => ({
      activo: iniciado,
      apiUrl: raiz,
      ultimoContacto,
      pendientesDeReporte: cola.pendientesDeReporte().length,
      backoffMs: backoff,
      ultimoError,
    }),
  }
}
