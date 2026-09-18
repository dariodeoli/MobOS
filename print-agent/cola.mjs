import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

// Cola persistente con estados honestos. Un envío aceptado por el transporte
// NO significa que salió papel: eso lo confirma el operador.
//   pendiente  → en cola; se reintenta solo ante fallos claros (antes de enviar).
//   incierto   → el transporte pudo haber enviado: NUNCA se reintenta solo
//                (duplicaría el ticket). Requiere reintento manual.
//   fallido    → falló claro tras los reintentos; reintento manual disponible.
// En el historial:
//   aceptado   → el transporte aceptó el trabajo; falta confirmación en papel.
//   confirmado → el operador verificó el ticket físico.
//   incierto / fallido → quedan registrados con su error real.
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
      jobId: trabajo.id,
      fecha: new Date().toISOString(),
      cliente: trabajo.cliente || '',
      usuario: trabajo.usuario || '',
      impresora: trabajo.impresora,
      resultado,
      confirmadoEn: null,
      error: error || '',
      bytes: trabajo.bytes || 0,
      ref: trabajo.ref || '',
      tipo: trabajo.tipo || '',
      // Datos de testeo: permiten auditar en la app qué configuración imprimió.
      validacion: trabajo.validacion || '',
      puente: trabajo.puente || '',
      tokenPista: trabajo.tokenPista || '',
      modo: trabajo.modo || '',
      ancho: trabajo.ancho || 0,
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
      anotar(siguiente, 'aceptado')
      log(`aceptado ${siguiente.id} en ${siguiente.impresora} (${siguiente.cliente || 'sin equipo'}) — pendiente de confirmación en papel`)
    } catch (error) {
      siguiente.error = error.message
      if (error?.incierto) {
        // El transporte pudo haber enviado: reintentar solo duplicaría.
        siguiente.estado = 'incierto'
        anotar(siguiente, 'incierto', error.message)
        log(`incierto ${siguiente.id}: ${error.message} — no se reintenta solo`)
      } else {
        siguiente.intentos = Number(siguiente.intentos || 0) + 1
        if (siguiente.intentos >= reintentos) {
          siguiente.estado = 'fallido'
          anotar(siguiente, 'fallido', error.message)
          log(`trabajo ${siguiente.id} falló definitivamente: ${error.message}`)
        } else {
          siguiente.proximoIntento = Date.now() + esperaMs
          log(`reintento ${siguiente.intentos}/${reintentos} de ${siguiente.id}: ${error.message}`)
        }
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
    async encolar({ impresora, data, cliente = '', usuario = '', ref = '', tipo = '', validacion = '', puente = '', tokenPista = '', modo = '', ancho = 0 }) {
      const bytes = Buffer.from(data, 'base64').length
      const trabajo = {
        id: randomUUID(),
        impresora,
        data,
        cliente,
        usuario: String(usuario || '').slice(0, 80),
        ref: String(ref || '').slice(0, 64),
        tipo: String(tipo || '').slice(0, 40),
        validacion: String(validacion || '').slice(0, 12),
        puente: String(puente || '').slice(0, 80),
        tokenPista: String(tokenPista || '').slice(0, 40),
        modo: String(modo || '').slice(0, 40),
        ancho: Math.min(120, Math.max(0, Number(ancho) || 0)),
        bytes,
        estado: 'pendiente',
        intentos: 0,
        proximoIntento: 0,
        creadoEn: new Date().toISOString(),
      }
      trabajos.push(trabajo)
      guardar()
      await procesar()
      const sigue = trabajos.find((item) => item.id === trabajo.id)
      if (sigue) {
        programar()
        return { encolado: true, jobId: trabajo.id, estado: sigue.estado, error: sigue.error || '' }
      }
      return { encolado: false, jobId: trabajo.id, estado: 'aceptado' }
    },
    estado(jobId) {
      const trabajo = trabajos.find((item) => item.id === jobId)
      if (trabajo) return { estado: trabajo.estado, intentos: trabajo.intentos, error: trabajo.error || '' }
      const entrada = historial.find((item) => item.jobId === jobId)
      if (entrada) return { estado: entrada.resultado, fecha: entrada.fecha, confirmadoEn: entrada.confirmadoEn || null, error: entrada.error || '' }
      // Un ID desconocido NUNCA puede figurar como impreso.
      return { estado: 'no-encontrado' }
    },
    // Confirmación en papel del operador: separada de "aceptado por transporte".
    confirmar(jobId) {
      const entrada = historial.find((item) => item.jobId === jobId)
      if (!entrada || entrada.resultado !== 'aceptado') return false
      entrada.resultado = 'confirmado'
      entrada.confirmadoEn = new Date().toISOString()
      guardarHistorial()
      log(`confirmado en papel ${jobId}`)
      return true
    },
    resumen() {
      return {
        pendientes: trabajos.filter((trabajo) => trabajo.estado === 'pendiente').length,
        inciertos: trabajos.filter((trabajo) => trabajo.estado === 'incierto').length,
        fallidos: trabajos.filter((trabajo) => trabajo.estado === 'fallido').length,
        sinConfirmar: historial.filter((entrada) => entrada.resultado === 'aceptado').length,
      }
    },
    historial: (limite = 20) => historial.slice(0, limite),
    listar() {
      return {
        pendientes: trabajos.filter((trabajo) => trabajo.estado === 'pendiente').map(publico),
        inciertos: trabajos.filter((trabajo) => trabajo.estado === 'incierto').map(publico),
        fallidos: trabajos.filter((trabajo) => trabajo.estado === 'fallido').map(publico),
      }
    },
    reanudar() { programar() },
    limpiarFallidos(ids = []) {
      const antes = trabajos.length
      const limpiables = (trabajo) => trabajo.estado === 'fallido' || trabajo.estado === 'incierto'
      if (Array.isArray(ids) && ids.length) {
        const elegidos = new Set(ids.map(String))
        trabajos = trabajos.filter((trabajo) => !limpiables(trabajo) || !elegidos.has(trabajo.id))
      } else {
        trabajos = trabajos.filter((trabajo) => trabajo.estado !== 'fallido')
      }
      guardar()
      return antes - trabajos.length
    },
    // Reintento manual (fallidos e inciertos): es la única vía para un trabajo
    // de resultado incierto, porque el automático podría duplicar el ticket.
    reintentarFallidos() {
      let contados = 0
      for (const trabajo of trabajos) {
        if (trabajo.estado !== 'fallido' && trabajo.estado !== 'incierto') continue
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
    validacion: trabajo.validacion || '',
    puente: trabajo.puente || '',
    tokenPista: trabajo.tokenPista || '',
    modo: trabajo.modo || '',
    ancho: trabajo.ancho || 0,
  }
}
