import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
//   remoto     → trabajo reclamado al backend ya reportado (no se confirma acá).
// Los trabajos remotos (`origen: 'remoto'`) los imprime el poller y su
// resultado se reporta al backend; esta cola solo los persiste y deduplica.
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
      // Los archivos pueden contener payloads de tickets: solo el dueño.
      writeFileSync(rutaArchivo, `${JSON.stringify(datos, null, 2)}\n`, { mode: 0o600 })
      try { chmodSync(rutaArchivo, 0o600) } catch { /* sistemas sin permisos POSIX */ }
    } catch (error) {
      log(`no se pudo guardar ${rutaArchivo}: ${error.message}`)
    }
  }
  const guardar = () => guardarJson(ruta, trabajos)
  const guardarHistorial = () => { if (rutaHistorial) guardarJson(rutaHistorial, historial.slice(0, historialMax)) }
  const esRemoto = (trabajo) => trabajo.origen === 'remoto'
  // Fallidos antiguos (más de 7 días) se descartan solos: ya no aportan
  // trazabilidad útil y ocupan la lista de la página. Un remoto sin reportar
  // nunca se descarta así: el outbox espera al backend.
  const LIMITE_FALLIDOS_MS = 7 * 24 * 60 * 60 * 1000
  const viejos = trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'fallido' && Date.now() - new Date(trabajo.creadoEn || 0).getTime() > LIMITE_FALLIDOS_MS)
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
      sufijo: trabajo.sufijo || '',
      // Largo del sufijo impreso: el panel lo usa para validar solo al
      // completar el código (#138). El valor sigue viviendo solo acá.
      sufijoLargo: String(trabajo.sufijo || '').length,
      puente: trabajo.puente || '',
      tokenPista: trabajo.tokenPista || '',
      modo: trabajo.modo || '',
      ancho: trabajo.ancho || 0,
      origen: trabajo.origen || 'local',
      estadoRemoto: trabajo.resultadoRemoto || '',
      transporte: trabajo.transporte || '',
    })
    guardarHistorial()
  }

  const estadoDe = (jobId) => {
    const trabajo = trabajos.find((item) => item.id === jobId)
    if (trabajo) return { estado: trabajo.estado, intentos: trabajo.intentos, error: trabajo.error || '' }
    const entrada = historial.find((item) => item.jobId === jobId)
    if (entrada) return { estado: entrada.resultado, fecha: entrada.fecha, confirmadoEn: entrada.confirmadoEn || null, error: entrada.error || '' }
    // Un ID desconocido NUNCA puede figurar como impreso.
    return { estado: 'no-encontrado' }
  }

  async function procesar() {
    if (procesando) return
    // El camino local solo toca trabajos locales: los remotos los imprime el poller.
    const siguiente = trabajos.find((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'pendiente' && Number(trabajo.proximoIntento || 0) <= Date.now())
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
    const pendiente = trabajos.find((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'pendiente')
    if (!pendiente) return
    const espera = Math.max(250, Number(pendiente.proximoIntento || 0) - Date.now())
    timer = setTimeout(() => { timer = null; procesar() }, Math.min(espera, esperaMs))
    if (timer.unref) timer.unref()
  }

  // Red de seguridad: si un timer de reintento se pierde (runners cargados,
  // suspensiones), la cola igual avanza. Es no-op mientras haya timer
  // programado o nada pendiente, y se apaga con el proceso.
  const latido = setInterval(() => { if (!timer) procesar() }, Math.max(250, Math.min(esperaMs, 2000)))
  if (latido.unref) latido.unref()

  return {
    // Intenta imprimir ya; si falla, el trabajo queda en la cola.
    async encolar({ impresora, data, cliente = '', usuario = '', ref = '', tipo = '', validacion = '', sufijo = '', puente = '', tokenPista = '', modo = '', ancho = 0 }) {
      const bytes = Buffer.from(data, 'base64').length
      const trabajo = {
        id: randomUUID(),
        origen: 'local',
        impresora,
        data,
        cliente,
        usuario: String(usuario || '').slice(0, 80),
        ref: String(ref || '').slice(0, 64),
        tipo: String(tipo || '').slice(0, 40),
        validacion: String(validacion || '').slice(0, 12),
        sufijo: String(sufijo ?? '').slice(0, 2),
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
    // Alta de un trabajo reclamado al backend. Solo persiste: el poller lo
    // imprime y reporta; el payload se borra tras el intento. Deduplica por id
    // contra la cola y el historial remoto para no reimprimir tras un reinicio.
    encolarRemoto(job = {}) {
      const id = String(job.id || '').trim()
      if (!id) return { encolado: false, error: 'El trabajo remoto no trae identificador.' }
      if (trabajos.some((trabajo) => trabajo.id === id) || historial.some((entrada) => entrada.jobId === id && entrada.origen === 'remoto')) {
        return { encolado: false, duplicado: true, estado: estadoDe(id) }
      }
      const payload = String(job.payload || '')
      trabajos.push({
        id,
        origen: 'remoto',
        impresora: String(job.destination || job.impresora || ''),
        data: payload,
        leaseId: String(job.leaseId || ''),
        copias: Math.min(5, Math.max(1, Number(job.copies) || 1)),
        cliente: '',
        usuario: String(job.requestedByName || '').slice(0, 80),
        ref: String(job.reference || '').slice(0, 64),
        tipo: String(job.kind || '').slice(0, 40),
        validacion: String(job.validation || '').slice(0, 12),
        sufijo: '',
        puente: String(job.bridgeName || '').slice(0, 80),
        tokenPista: String(job.tokenHint || '').slice(0, 40),
        modo: String(job.mode || '').slice(0, 40),
        ancho: Math.min(120, Math.max(0, Number(job.width) || 0)),
        bytes: Number(job.payloadBytes) || Buffer.from(payload, 'base64').length,
        estado: 'pendiente',
        resultadoRemoto: '',
        transporte: '',
        reportado: false,
        intentos: Number(job.attempts) || 0,
        proximoIntento: 0,
        error: '',
        creadoEn: new Date().toISOString(),
      })
      guardar()
      return { encolado: true, jobId: id }
    },
    // Resultado del intento de impresión remoto. El payload local se borra en
    // el mismo paso: alcanza con los metadatos para reportar al backend.
    resultadoRemoto(id, { estado, error = '', transporte = '' } = {}) {
      if (!['ACEPTADO', 'INCIERTO', 'FALLIDO'].includes(estado)) return { ok: false, motivo: 'estado-invalido' }
      const trabajo = trabajos.find((item) => item.id === id && esRemoto(item))
      if (!trabajo) {
        const entrada = historial.find((item) => item.jobId === id && item.origen === 'remoto')
        return entrada ? { ok: true, ya: true } : { ok: false, motivo: 'no-encontrado' }
      }
      trabajo.estado = estado === 'ACEPTADO' ? 'aceptado' : estado === 'INCIERTO' ? 'incierto' : 'fallido'
      trabajo.resultadoRemoto = estado
      trabajo.transporte = transporte || ''
      trabajo.error = error || ''
      trabajo.data = ''
      trabajo.reportado = false
      guardar()
      return { ok: true, estado: trabajo.estado }
    },
    // El backend ya recibió el resultado (o no conoce el trabajo): sale del
    // outbox y queda asentado en el historial como remoto.
    marcarReportado(id) {
      const indice = trabajos.findIndex((item) => item.id === id && esRemoto(item))
      if (indice === -1) {
        const entrada = historial.find((item) => item.jobId === id && item.origen === 'remoto')
        return entrada ? { ok: true, ya: true } : { ok: false, motivo: 'no-encontrado' }
      }
      const [trabajo] = trabajos.splice(indice, 1)
      anotar(trabajo, 'remoto')
      guardar()
      return { ok: true }
    },
    // Outbox: resultados de trabajos remotos que todavía no aceptó el backend.
    pendientesDeReporte() {
      return trabajos.filter((trabajo) => esRemoto(trabajo) && !trabajo.reportado && trabajo.resultadoRemoto).map((trabajo) => ({
        id: trabajo.id,
        leaseId: trabajo.leaseId || '',
        resultado: trabajo.resultadoRemoto,
        error: trabajo.error || '',
        transporte: trabajo.transporte || '',
        impresora: trabajo.impresora,
        ref: trabajo.ref || '',
        tipo: trabajo.tipo || '',
        intentos: trabajo.intentos || 0,
      }))
    },
    // Al arrancar tras un reinicio, un trabajo reclamado sin resultado pudo
    // haberse impreso: se marca incierto y se reporta; nunca se reimprime solo.
    reconciliarRemotos() {
      let contados = 0
      for (const trabajo of trabajos) {
        if (!esRemoto(trabajo) || trabajo.resultadoRemoto) continue
        trabajo.estado = 'incierto'
        trabajo.resultadoRemoto = 'INCIERTO'
        trabajo.error = 'El agente se reinició durante la impresión.'
        trabajo.data = ''
        trabajo.reportado = false
        contados += 1
      }
      if (contados) guardar()
      return contados
    },
    estado: estadoDe,
    // Confirmación en papel del operador: separada de "aceptado por transporte".
    // Si el trabajo guardó sufijo secreto, hay que repetirlo para confirmar:
    // eso prueba que el papel se vio (el sufijo no se muestra en la app).
    confirmar(jobId, sufijo = '') {
      const entrada = historial.find((item) => item.jobId === jobId)
      if (!entrada) return { ok: false, motivo: 'no-encontrado' }
      if (entrada.resultado === 'confirmado') return { ok: false, motivo: 'ya-confirmado' }
      // La confirmación la decide quien ve el papel: se permite aunque el
      // transporte todavía no haya reportado "aceptado" (pendiente, impreso o
      // incierto); el sufijo secreto sigue siendo la prueba.
      if (!['aceptado', 'impreso', 'pendiente', 'incierto'].includes(entrada.resultado)) return { ok: false, motivo: 'no-confirmable' }
      if (entrada.sufijo && String(sufijo).trim() !== String(entrada.sufijo)) return { ok: false, motivo: 'sufijo-incorrecto' }
      entrada.resultado = 'confirmado'
      entrada.confirmadoEn = new Date().toISOString()
      // Confirmar en papel resuelve el trabajo: si seguía en la cola esperando
      // acción manual (pendiente o incierto), ya no queda ahí.
      if (trabajos.some((trabajo) => trabajo.id === jobId)) {
        trabajos = trabajos.filter((trabajo) => trabajo.id !== jobId)
        guardar()
      }
      guardarHistorial()
      log(`confirmado en papel ${jobId}`)
      return { ok: true }
    },
    resumen() {
      return {
        pendientes: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'pendiente').length,
        inciertos: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'incierto').length,
        fallidos: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'fallido').length,
        sinConfirmar: historial.filter((entrada) => ['aceptado', 'impreso', 'pendiente', 'incierto'].includes(entrada.resultado)).length,
      }
    },
    historial: (limite = 20) => historial.slice(0, limite),
    listar() {
      return {
        pendientes: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'pendiente').map(publico),
        inciertos: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'incierto').map(publico),
        fallidos: trabajos.filter((trabajo) => !esRemoto(trabajo) && trabajo.estado === 'fallido').map(publico),
      }
    },
    reanudar() { programar() },
    limpiarFallidos(ids = []) {
      const antes = trabajos.length
      // Los remotos sin reportar no se limpian nunca: perderían su resultado.
      const limpiables = (trabajo) => !esRemoto(trabajo) && (trabajo.estado === 'fallido' || trabajo.estado === 'incierto')
      if (Array.isArray(ids) && ids.length) {
        const elegidos = new Set(ids.map(String))
        trabajos = trabajos.filter((trabajo) => !limpiables(trabajo) || !elegidos.has(trabajo.id))
      } else {
        trabajos = trabajos.filter((trabajo) => !limpiables(trabajo) || trabajo.estado === 'incierto')
      }
      guardar()
      return antes - trabajos.length
    },
    // Reintento manual (fallidos e inciertos): es la única vía para un trabajo
    // de resultado incierto, porque el automático podría duplicar el ticket.
    // Un remoto no se reintenta: su payload ya se borró y el backend decide.
    reintentarFallidos() {
      let contados = 0
      for (const trabajo of trabajos) {
        if (esRemoto(trabajo)) continue
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
    origen: trabajo.origen || 'local',
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
    sufijo: trabajo.sufijo || '',
    // Largo del sufijo impreso (#138): el panel valida solo al completar el
    // código sin conocer el valor.
    sufijoLargo: String(trabajo.sufijo || '').length,
    puente: trabajo.puente || '',
    tokenPista: trabajo.tokenPista || '',
    modo: trabajo.modo || '',
    ancho: trabajo.ancho || 0,
  }
}
