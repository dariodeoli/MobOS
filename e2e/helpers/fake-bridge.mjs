// Puente de impresión falso para los e2e: se vincula con un código real,
// reclama trabajos por HTTPS, "imprime" (solo registra) y reporta ACEPTADO.
// No habla con ninguna impresora: prueba el camino remoto de punta a punta.

const CONSULTA_MS = 250

// El sufijo real viaja impreso en el ticket ESC/POS. El puente falso lo lee
// del payload como lo haría el operador con el papel en la mano.
export function sufijoDelTicket(payload) {
  const texto = Buffer.from(String(payload || ''), 'base64').toString('latin1')
  const match = texto.match(/VALIDACI.N\s+(\d{4})-(\d)/) || texto.match(/(\d{4})-(\d)\b/)
  return match ? match[2] : ''
}

export async function parearPuente({ api, code, version = '1.6.0', platform = 'e2e' }) {
  const respuesta = await fetch(`${api}/api/print/bridge/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, version, platform }),
  })
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok || !datos?.token) throw new Error(`No se pudo parear el puente falso: HTTP ${respuesta.status}`)
  return { token: String(datos.token), bridgeId: String(datos.bridgeId || '') }
}

export function crearPuenteFalso({ api, token, intervaloMs = CONSULTA_MS, log = () => {} }) {
  const trabajos = new Map()
  let activo = false
  let timer = null
  let estadoHttp = 0
  let ultimoError = ''

  const pedir = async (ruta, opciones = {}) => {
    const respuesta = await fetch(`${api}${ruta}`, {
      method: opciones.method || 'GET',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      ...(opciones.body ? { body: JSON.stringify(opciones.body) } : {}),
    })
    estadoHttp = respuesta.status
    const datos = await respuesta.json().catch(() => ({}))
    if (!respuesta.ok) {
      const error = new Error(datos?.error || `HTTP ${respuesta.status}`)
      error.status = respuesta.status
      throw error
    }
    return datos
  }

  const imprimir = async (trabajo) => {
    const entrada = { ...trabajo, sufijo: sufijoDelTicket(trabajo.payload) }
    // Se registra recién cuando el resultado quedó reportado: esperarTrabajo
    // devuelve trabajos en ACEPTADO, no reclamados a medias.
    await pedir(`/api/print/bridge/jobs/${encodeURIComponent(trabajo.id)}/result`, {
      method: 'POST',
      body: { leaseId: trabajo.leaseId, state: 'ACEPTADO', transport: 'fake' },
    })
    entrada.aceptadoEn = new Date().toISOString()
    trabajos.set(trabajo.id, entrada)
    log(`puente falso: ${trabajo.id} aceptado (sufijo ${entrada.sufijo || '?'})`)
  }

  const programar = () => {
    if (!activo) return
    timer = setTimeout(async () => {
      timer = null
      if (!activo) return
      try {
        const datos = await pedir('/api/print/bridge/claim', { method: 'POST', body: { capacity: 1 } })
        ultimoError = ''
        for (const trabajo of datos?.jobs || []) await imprimir(trabajo)
      } catch (error) {
        ultimoError = error?.message || String(error)
      }
      programar()
    }, intervaloMs)
    if (timer.unref) timer.unref()
  }

  return {
    iniciar() {
      if (activo) return
      activo = true
      programar()
    },
    detener() {
      activo = false
      if (timer) clearTimeout(timer)
      timer = null
    },
    trabajos: () => [...trabajos.values()],
    esperarTrabajo: async (predicado = () => true, timeoutMs = 20000) => {
      const hasta = Date.now() + timeoutMs
      while (Date.now() < hasta) {
        const encontrado = [...trabajos.values()].find(predicado)
        if (encontrado) return encontrado
        await new Promise((listo) => setTimeout(listo, 100))
      }
      throw new Error('El puente falso no reclamó ningún trabajo a tiempo.')
    },
    estado: () => ({ activo, estadoHttp, ultimoError, trabajos: trabajos.size }),
  }
}
