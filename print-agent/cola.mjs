import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

// Cola persistente: si la impresora está apagada o sin red, el trabajo queda
// guardado y se reintenta solo. Un trabajo por vez para no mezclar tickets.
export function crearCola({ ruta, enviar, esperaMs = 15000, reintentos = 5, log = () => {} }) {
  let trabajos = []
  try { if (existsSync(ruta)) trabajos = JSON.parse(readFileSync(ruta, 'utf8')) || [] } catch { trabajos = [] }
  let procesando = false
  let timer = null

  const guardar = () => {
    try {
      mkdirSync(dirname(ruta), { recursive: true })
      writeFileSync(ruta, `${JSON.stringify(trabajos, null, 2)}\n`)
    } catch (error) {
      log(`no se pudo guardar la cola: ${error.message}`)
    }
  }

  async function procesar() {
    if (procesando) return
    const siguiente = trabajos.find((trabajo) => trabajo.estado === 'pendiente' && Number(trabajo.proximoIntento || 0) <= Date.now())
    if (!siguiente) return
    procesando = true
    try {
      await enviar(siguiente.impresora, Buffer.from(siguiente.data, 'base64'))
      trabajos = trabajos.filter((trabajo) => trabajo.id !== siguiente.id)
      log(`impreso ${siguiente.id} en ${siguiente.impresora}`)
    } catch (error) {
      siguiente.intentos = Number(siguiente.intentos || 0) + 1
      if (siguiente.intentos >= reintentos) {
        siguiente.estado = 'fallido'
        siguiente.error = error.message
        log(`trabajo ${siguiente.id} falló definitivamente: ${error.message}`)
      } else {
        siguiente.proximoIntento = Date.now() + esperaMs
        siguiente.error = error.message
        log(`reintento ${siguiente.intentos}/${reintentos} de ${siguiente.id}: ${error.message}`)
      }
    } finally {
      procesando = false
      guardar()
      programar()
    }
  }

  function programar() {
    if (timer) return
    const pendiente = trabajos.find((trabajo) => trabajo.estado === 'pendiente')
    if (!pendiente) return
    const espera = Math.max(250, Number(pendiente.proximoIntento || 0) - Date.now())
    timer = setTimeout(() => { timer = null; procesar() }, Math.min(espera, esperaMs))
    if (timer.unref) timer.unref()
  }

  return {
    // Intenta imprimir ya; si falla, el trabajo queda en la cola.
    async encolar({ impresora, data }) {
      const trabajo = { id: randomUUID(), impresora, data, estado: 'pendiente', intentos: 0, proximoIntento: 0, creadoEn: new Date().toISOString() }
      trabajos.push(trabajo)
      guardar()
      await procesar()
      const sigue = trabajos.find((item) => item.id === trabajo.id)
      if (sigue) { programar(); return { encolado: true, jobId: trabajo.id, error: sigue.error || '' } }
      return { encolado: false, jobId: trabajo.id }
    },
    estado(jobId) {
      const trabajo = trabajos.find((item) => item.id === jobId)
      if (!trabajo) return { estado: 'impreso' }
      return { estado: trabajo.estado, intentos: trabajo.intentos, error: trabajo.error || '' }
    },
    resumen() {
      return {
        pendientes: trabajos.filter((trabajo) => trabajo.estado === 'pendiente').length,
        fallidos: trabajos.filter((trabajo) => trabajo.estado === 'fallido').length,
      }
    },
    reanudar() { programar() },
  }
}
