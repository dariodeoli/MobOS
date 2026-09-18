import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

// Cola persistente: si la impresora está apagada o sin red, el trabajo queda
// guardado y se reintenta solo. Un trabajo por vez para no mezclar tickets.
// Además guarda un historial corto (quién imprimió, desde qué equipo y cómo
// salió) para la página de estado.
export function crearCola({ ruta, rutaHistorial, enviar, esperaMs = 15000, reintentos = 5, historialMax = 60, log = () => {} }) {
  let trabajos = []
  let historial = []
  try { if (existsSync(ruta)) trabajos = JSON.parse(readFileSync(ruta, 'utf8')) || [] } catch { trabajos = [] }
  try { if (rutaHistorial && existsSync(rutaHistorial)) historial = JSON.parse(readFileSync(rutaHistorial, 'utf8')) || [] } catch { historial = [] }
  let procesando = false
  let timer = null

  const guardarJson = (rutaArchivo, datos) => {
    try {
      mkdirSync(dirname(rutaArchivo), { recursive: true })
      writeFileSync(rutaArchivo, `${JSON.stringify(datos, null, 2)}\n`)
    } catch (error) {
      log(`no se pudo guardar ${rutaArchivo}: ${error.message}`)
    }
  }
  const guardar = () => guardarJson(ruta, trabajos)
  const guardarHistorial = () => { if (rutaHistorial) guardarJson(rutaHistorial, historial.slice(0, historialMax)) }
  // Fallidos antiguos (más de 7 días) se descartan solos: ya no aportan
  // trazabilidad útil y ocupan la lista de la página.
  const LIMITE_FALLIDOS_MS = 7 * 24 * 60 * 60 * 1000
  const viejos = trabajos.filter((trabajo) => trabajo.estado === 'fallido' && Date.now() - new Date(trabajo.creadoEn || 0).getTime() > LIMITE_FALLIDOS_MS)
  if (viejos.length) {
    trabajos = trabajos.filter((trabajo) => !viejos.includes(trabajo))
    guardar()
  }

  const anotar = (trabajo, resultado, error = '') => {
    historial.unshift({
      id: trabajo.id || '',
      fecha: new Date().toISOString(),
      cliente: trabajo.cliente || '',
      usuario: trabajo.usuario || '',
      impresora: trabajo.impresora,
      resultado,
      error: error || '',
      bytes: trabajo.bytes || 0,
      ref: trabajo.ref || '',
      tipo: trabajo.tipo || '',
    })
    guardarHistorial()
  }

  async function procesar() {
    if (procesando) return
    const siguiente = trabajos.find((trabajo) => trabajo.estado === 'pendiente' && Number(trabajo.proximoIntento || 0) <= Date.now())
    if (!siguiente) return
    procesando = true
    try {
      await enviar(siguiente.impresora, Buffer.from(siguiente.data, 'base64'))
      trabajos = trabajos.filter((trabajo) => trabajo.id !== siguiente.id)
      anotar(siguiente, 'impreso')
      log(`impreso ${siguiente.id} en ${siguiente.impresora} (${siguiente.cliente || 'sin equipo'})`)
    } catch (error) {
      siguiente.intentos = Number(siguiente.intentos || 0) + 1
      if (siguiente.intentos >= reintentos) {
        siguiente.estado = 'fallido'
        siguiente.error = error.message
        anotar(siguiente, 'fallido', error.message)
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
    async encolar({ impresora, data, cliente = '', usuario = '', ref = '', tipo = '' }) {
      const bytes = Buffer.from(data, 'base64').length
      const trabajo = { id: randomUUID(), impresora, data, cliente, usuario: String(usuario || '').slice(0, 80), ref: String(ref || '').slice(0, 64), tipo: String(tipo || '').slice(0, 40), bytes, estado: 'pendiente', intentos: 0, proximoIntento: 0, creadoEn: new Date().toISOString() }
      trabajos.push(trabajo)
      guardar()
      await procesar()
      const sigue = trabajos.find((item) => item.id === trabajo.id)
      if (sigue) { programar(); return { encolado: true, jobId: trabajo.id, error: sigue.error || '' } }
      return { encolado: false, jobId: trabajo.id }
    },
    estado(jobId) {
      const trabajo = trabajos.find((item) => item.id === jobId)
      if (!trabajo) {
        // Ya salió de la cola: quedó impreso o el usuario lo confirmó a mano.
        const reciente = historial.find((item) => item.id === jobId)
        return { estado: reciente ? (reciente.resultado === 'confirmado' ? 'confirmado' : 'impreso') : 'impreso', intentos: 0, error: '' }
      }
      return { estado: trabajo.estado, intentos: trabajo.intentos, error: trabajo.error || '' }
    },
    // Confirmación física: el usuario vio el papel y lo marca en la app. El
    // trabajo sale de la cola y queda en el historial como 'confirmado'.
    confirmar(jobId) {
      const trabajo = trabajos.find((item) => item.id === jobId)
      if (!trabajo) {
        // Ya salió de la cola: se anota la confirmación sobre el historial.
        const reciente = historial.find((item) => item.id === jobId)
        if (!reciente) return { ok: false, error: 'Trabajo no encontrado.' }
        reciente.resultado = 'confirmado'
        guardarHistorial()
        return { ok: true, confirmado: true }
      }
      trabajos = trabajos.filter((item) => item.id !== jobId)
      anotar(trabajo, 'confirmado')
      guardar()
      guardarHistorial()
      return { ok: true, confirmado: true }
    },
    resumen() {
      return {
        pendientes: trabajos.filter((trabajo) => trabajo.estado === 'pendiente').length,
        fallidos: trabajos.filter((trabajo) => trabajo.estado === 'fallido').length,
      }
    },
    historial: (limite = 20) => historial.slice(0, limite),
    listar() {
      return {
        pendientes: trabajos.filter((trabajo) => trabajo.estado === 'pendiente').map(publico),
        fallidos: trabajos.filter((trabajo) => trabajo.estado === 'fallido').map(publico),
      }
    },
    reanudar() { programar() },
    limpiarFallidos(ids = []) {
      const antes = trabajos.length
      if (Array.isArray(ids) && ids.length) {
        const elegidos = new Set(ids.map(String))
        trabajos = trabajos.filter((trabajo) => trabajo.estado !== 'fallido' || !elegidos.has(trabajo.id))
      } else {
        trabajos = trabajos.filter((trabajo) => trabajo.estado !== 'fallido')
      }
      guardar()
      return antes - trabajos.length
    },
    reintentarFallidos() {
      let contados = 0
      for (const trabajo of trabajos) {
        if (trabajo.estado !== 'fallido') continue
        trabajo.estado = 'pendiente'
        trabajo.intentos = 0
        trabajo.proximoIntento = 0
        trabajo.error = ''
        contados += 1
      }
      guardar()
      programar()
      return contados
    },
  }
}

// Datos públicos de un trabajo para la API: sin el contenido del ticket.
function publico(trabajo) {
  return {
    id: trabajo.id,
    impresora: trabajo.impresora,
    cliente: trabajo.cliente || '',
    usuario: trabajo.usuario || '',
    estado: trabajo.estado,
    intentos: trabajo.intentos,
    error: trabajo.error || '',
    bytes: trabajo.bytes || 0,
    creadoEn: trabajo.creadoEn,
    ref: trabajo.ref || '',
    tipo: trabajo.tipo || '',
  }
}
