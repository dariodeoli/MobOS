import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as crearServidorHttp } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const VERSION_PAQUETE = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version
const TOKEN = 'token-de-prueba'

// Puerto libre para no chocar con corridas anteriores ni con otros agentes.
function puertoLibre() {
  return new Promise((resolve) => {
    const servidor = createServer()
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      servidor.close(() => resolve(port))
    })
  })
}

// Impresora falsa: escucha como una térmica de red y guarda lo que recibe.
function impresoraFalsa(puerto) {
  const recibido = []
  const servidor = createServer((socket) => {
    const partes = []
    socket.on('data', (parte) => partes.push(parte))
    socket.on('end', () => recibido.push(Buffer.concat(partes)))
  })
  return new Promise((resolve) => {
    servidor.listen(puerto, '127.0.0.1', () => resolve({
      recibido,
      conDatos: () => recibido.filter((buffer) => buffer.length > 0),
      cerrar: () => new Promise((listo) => servidor.close(listo)),
    }))
  })
}

async function esperar(condicion, { intentos = 40, espera = 150 } = {}) {
  for (let i = 0; i < intentos; i += 1) {
    if (await condicion()) return true
    await new Promise((listo) => setTimeout(listo, espera))
  }
  return false
}

async function arrancarAgente(dir, { impresora, puerto, extra = {} }) {
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ puerto, token: TOKEN, impresora, ancho: 58, copias: 1, reintentos: 3, esperaMs: 500, lan: [impresora], ...extra }))
  const proceso = spawn(process.execPath, [join(RAIZ, 'server.mjs')], { env: { ...process.env, MOBOS_PRINT_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] })
  let salida = ''
  proceso.stdout.on('data', (parte) => { salida += parte })
  proceso.stderr.on('data', (parte) => process.stderr.write(`[agente] ${parte}`))
  // El arranque está listo cuando el HTTP responde, no cuando aparece texto en
  // stdout: leer el buffer era una carrera (en CI el puerto todavía no
  // escuchaba y el primer fetch del test fallaba). Se espera por condición
  // contra /health, que sin token responde apenas el servidor escucha.
  const listo = await esperar(async () => {
    if (proceso.exitCode !== null) throw new Error(`el agente terminó al arrancar (exit=${proceso.exitCode}):\n${salida.slice(-2000)}`)
    try {
      const res = await fetch(`http://127.0.0.1:${puerto}/health`)
      return res.ok
    } catch { return false }
  }, { intentos: 150, espera: 100 })
  assert.ok(listo, `el agente no respondió /health al arrancar:\n${salida.slice(-2000)}`)
  // El stdout del agente queda disponible para los mensajes de fallo: sin esto
  // un flake de CI (cola, reintentos, transporte) no deja rastro.
  proceso.salida = () => salida
  return proceso
}

// Diagnóstico de un wait fallido: estado real del trabajo en la cola del
// agente más su stdout (reintentos, transporte y errores). Sin esto, un flake
// de CI no deja rastro de por qué la cola no entregó.
async function pistaDeFallo(proceso, base, cabeceras, jobId) {
  const estado = jobId
    ? await fetch(`${base}/jobs/${jobId}`, { headers: cabeceras }).then((r) => r.json()).catch(() => ({}))
    : {}
  const cola = await fetch(`${base}/jobs`, { headers: cabeceras }).then((r) => r.json()).catch(() => ({}))
  const resumen = cola?.pendientes
    ? `pendientes=${cola.pendientes.length} fallidos=${cola.fallidos.length} inciertos=${cola.inciertos.length}`
    : 'la cola no respondió'
  return `job=${estado.estado || '?'} intentos=${estado.intentos ?? '?'} error=${estado.error || 'sin error'} · ${resumen}\n--- stdout del agente ---\n${(proceso?.salida?.() || '(sin salida)').slice(-2000)}`
}

// Backend remoto mínimo: solo necesita responder claim y config para probar el
// arranque del poller desde server.mjs.
async function backendRemotoFalso() {
  const pedidos = []
  const servidor = crearServidorHttp((request, response) => {
    request.on('data', () => {})
    request.on('end', () => {
      const ruta = new URL(request.url, 'http://127.0.0.1').pathname
      pedidos.push(ruta)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(ruta === '/api/print/bridge/claim' ? { jobs: [] } : { ok: true }))
    })
  })
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      resolve({
        pedidos,
        url: `http://127.0.0.1:${port}`,
        cerrar: () => new Promise((listo) => servidor.close(listo)),
      })
    })
  })
}

// Regresión del crash de arranque: sin impresora configurada el agente debe
// quedar vivo y responder /health (antes: "interfaces is not iterable" mataba
// el proceso y launchd lo relanzaba en loop).
test('el agente arranca sin impresora configurada y /health responde', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-sin-'))
  const puertoAgente = await puertoLibre()
  const proceso = await arrancarAgente(dir, { impresora: '', puerto: puertoAgente })
  t.after(() => { try { proceso.kill('SIGKILL') } catch { /* ya muerto */ } })
  let respuesta = null
  await esperar(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${puertoAgente}/health`, { headers: { 'x-mobos-print-token': TOKEN } })
      if (!res.ok) return false
      const datos = await res.json()
      if (!datos?.version) return false
      respuesta = datos
      return true
    } catch { return false }
  }, { intentos: 60, espera: 150 })
  assert.ok(respuesta, 'el agente responde /health sin impresora configurada')
  assert.equal(respuesta.version, VERSION_PAQUETE, 'la versión identifica el build con el fix')
  assert.ok(respuesta.red, 'el payload incluye red.autotest')
  assert.equal(respuesta.red.autotest.ok, false, 'sin impresora el autotest no puede dar ok')
  assert.equal(respuesta.remoto.activo, false, 'sin apiUrl+token el modo remoto queda apagado')
  assert.deepEqual(Object.keys(respuesta.remoto).sort(), ['activo', 'apiUrl', 'backoffMs', 'pendientesDeReporte', 'ultimoContacto', 'ultimoError'])
})

test('el agente arranca el poller remoto con apiUrl+token y lo reporta en /health', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-remoto-'))
  const puertoAgente = await puertoLibre()
  const backend = await backendRemotoFalso()
  const agente = await arrancarAgente(dir, {
    impresora: '',
    puerto: puertoAgente,
    extra: { apiUrl: backend.url, bridgeToken: 'token-secreto-del-puente', intervaloPollMs: 400 },
  })
  t.after(() => { agente.kill('SIGKILL'); backend.cerrar() })
  const cabeceras = { 'x-mobos-print-token': TOKEN }
  let salud = null
  await esperar(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${puertoAgente}/health`, { headers: cabeceras })
      if (!res.ok) return false
      salud = await res.json()
      return salud?.remoto?.activo === true
    } catch { return false }
  }, { intentos: 60, espera: 150 })
  assert.ok(salud, 'el agente sigue respondiendo con el poller remoto activo')
  assert.equal(salud.remoto.apiUrl, backend.url)
  assert.ok(salud.remoto.ultimoContacto, 'el primer poll ya contactó al backend')
  assert.equal(salud.remoto.pendientesDeReporte, 0)
  assert.ok(!JSON.stringify(salud).includes('token-secreto-del-puente'), 'el token del puente no se expone en /health')
  assert.ok(backend.pedidos.includes('/api/print/bridge/claim'), 'el poller reclamó trabajo')
})

test('el agente sobrevive sin impresora y sin red: apiUrl inalcanzable no lo tumba', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-sin-red-'))
  const puertoAgente = await puertoLibre()
  // Puerto libre que nadie escucha: el poll remoto falla en cada intento.
  const puertoMuerto = await puertoLibre()
  const agente = await arrancarAgente(dir, {
    impresora: '',
    puerto: puertoAgente,
    extra: { apiUrl: `http://127.0.0.1:${puertoMuerto}`, bridgeToken: 'token-sin-red', intervaloPollMs: 250 },
  })
  t.after(() => { try { agente.kill('SIGKILL') } catch { /* ya muerto */ } })
  let salud = null
  await esperar(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${puertoAgente}/health`, { headers: { 'x-mobos-print-token': TOKEN } })
      if (!res.ok) return false
      salud = await res.json()
      return Boolean(salud?.remoto?.ultimoError)
    } catch { return false }
  }, { intentos: 60, espera: 150 })
  assert.ok(salud, 'el agente responde /health aunque el backend no exista')
  assert.equal(salud.red.autotest.ok, false, 'sin impresora el autotest queda en falla')
  assert.ok(salud.remoto.ultimoError, 'el poller reporta el error de red sin tumbar el proceso')
  assert.equal(agente.exitCode, null, 'el proceso sigue vivo')
})

test('el agente imprime por red, encola si la impresora está caída y protege con token', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = await puertoLibre()
  const puertoImpresora = await puertoLibre()
  const base = `http://127.0.0.1:${puertoAgente}`
  const cabeceras = { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN, Origin: 'https://app.moboss.online' }
  const ticket = Buffer.from([0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a]).toString('base64')

  // Sin impresora todavía: el trabajo queda en la cola. Cada intento cuesta
  // ~1,3 s (enviarLan reintenta 3×400 ms también con ECONNREFUSED) y la cola
  // agota `reintentos`: con los 3 intentos por defecto la ventana era ~6 s
  // (config.mjs clampea esperaMs a >=1000) y en CI el trabajo quedaba
  // 'fallido' antes de que el test encendiera la impresora (flake: 7374 ms,
  // "la cola reintentó y llegó a la impresora"). `reintentos` es config del
  // agente (máx 20) y acá se usa el tope para darle aire al test (~45 s).
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente, extra: { reintentos: 20 } })
  t.after(() => agente.kill('SIGKILL'))

  const saludSinToken = await fetch(`${base}/health`).then((r) => r.json())
  assert.equal(saludSinToken.ok, true)
  assert.equal(saludSinToken.impresoras, undefined)

  const salud = await fetch(`${base}/health`, { headers: cabeceras }).then((r) => r.json())
  assert.deepEqual(salud.impresoras.lan, [`lan:127.0.0.1:${puertoImpresora}`])
  assert.equal(salud.cola.pendientes, 0)
  assert.equal(salud.impresoraOk, false) // la impresora todavía está apagada

  const sinToken = await fetch(`${base}/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: ticket }) })
  assert.equal(sinToken.status, 401)

  const malFormado = await fetch(`${base}/print`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ impresora: `lan:127.0.0.1:${puertoImpresora}`, data: 'no-es-base64!!' }) })
  assert.equal(malFormado.status, 400)

  const encolado = await fetch(`${base}/print`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ impresora: `lan:127.0.0.1:${puertoImpresora}`, data: ticket }) })
  const respuesta = await encolado.json()
  assert.equal(encolado.status, 202)
  assert.equal(respuesta.encolado, true)

  // Se enciende la impresora: el reintento de la cola la alcanza.
  const impresora = await impresoraFalsa(puertoImpresora)
  t.after(() => impresora.cerrar())
  const llego = await esperar(() => impresora.conDatos().length > 0, { intentos: 200, espera: 150 })
  if (!llego) {
    assert.fail(`la cola no llegó a la impresora\n${await pistaDeFallo(agente, base, cabeceras, respuesta.jobId)}`)
  }
  // El alcance se sondea con caché de 3 s: se espera por condición a que
  // expire y el próximo /health vea la impresora encendida (sin sleep fijo).
  let saludEncendida = null
  assert.ok(await esperar(async () => {
    saludEncendida = await fetch(`${base}/health`, { headers: cabeceras }).then((r) => r.json())
    return saludEncendida.impresoraOk === true
  }, { intentos: 100, espera: 150 }), 'el agente detecta la impresora encendida')
  assert.deepEqual([...impresora.conDatos()[0]], [0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a])

  // La cola queda vacía y el trabajo figura impreso: ambas condiciones se
  // esperan (el estado sale del historial recién cuando el envío terminó).
  let estado = null
  assert.ok(await esperar(async () => {
    estado = await fetch(`${base}/jobs/${respuesta.jobId}`, { headers: cabeceras }).then((r) => r.json())
    return estado.estado === 'aceptado'
  }, { intentos: 60, espera: 150 }), `el trabajo quedó en estado ${estado?.estado || '?'} (${estado?.error || 'sin error'})`)
  const colaVacia = () => {
    try { return JSON.parse(readFileSync(join(dir, 'cola.json'), 'utf8')).length === 0 } catch { return false }
  }
  assert.ok(await esperar(colaVacia, { intentos: 60, espera: 150 }), 'la cola quedó vacía en disco')

  // El preflight de red local responde con el header que pide Chrome.
  const preflight = await fetch(`${base}/print`, { method: 'OPTIONS', headers: { Origin: 'https://app.moboss.online', 'Access-Control-Request-Method': 'POST' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true')
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.moboss.online')
})

test('la app local (loopback + origen permitido) imprime sin token', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-app-'))
  const puertoAgente = await puertoLibre()
  const puertoImpresora = await puertoLibre()
  const base = `http://127.0.0.1:${puertoAgente}`
  const impresora = await impresoraFalsa(puertoImpresora)
  t.after(() => impresora.cerrar())
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente })
  t.after(() => agente.kill('SIGKILL'))

  const app = await fetch(`${base}/health`, { headers: { Origin: 'https://app.moboss.online' } }).then((r) => r.json())
  assert.ok(app.impresoras, 'la app local ve el estado completo sin token')
  const ajeno = await fetch(`${base}/health`, { headers: { Origin: 'https://otro.example' } }).then((r) => r.json())
  assert.equal(ajeno.impresoras, undefined, 'otro origen no pasa sin token')

  const ticket = Buffer.from('APP-LOCAL').toString('base64')
  const impreso = await fetch(`${base}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://app.moboss.online' },
    body: JSON.stringify({ impresora: `lan:127.0.0.1:${puertoImpresora}`, data: ticket }),
  }).then((r) => r.json())
  assert.equal(impreso.ok, true)
  assert.ok(await esperar(() => impresora.conDatos().length > 0), 'la app local imprimió sin token')
})

test('el parser de lpstat -v corta los dos puntos del nombre de la cola', async () => {
  const { parsearColasCups } = await import('../transportes.mjs')
  const colas = parsearColasCups('device for ZKP8008: socket://192.168.1.23:9100\ndevice for Otra: usb://Zebra/ZD220\n')
  assert.deepEqual(colas, [
    { nombre: 'ZKP8008', uri: 'socket://192.168.1.23:9100', tipo: 'red' },
    { nombre: 'Otra', uri: 'usb://Zebra/ZD220', tipo: 'usb' },
  ])
})

test('la cache del camino directo evita el intento bloqueado hasta el TTL', async () => {
  const { crearCacheDirecto } = await import('../transportes.mjs')
  let ahora = 1_000
  const cache = crearCacheDirecto({ ttlMs: 500, ahora: () => ahora })
  assert.equal(cache.bloqueado(), false)
  cache.bloquear()
  assert.equal(cache.bloqueado(), true, 'tras el fallo queda bloqueado')
  ahora += 499
  assert.equal(cache.bloqueado(), true, 'antes del TTL sigue bloqueado')
  ahora += 1
  assert.equal(cache.bloqueado(), false, 'el TTL lo rehabilita')
  cache.bloquear()
  cache.habilitar()
  assert.equal(cache.bloqueado(), false, 'un alcance exitoso lo rehabilita')
})

test('la cola CUPS de respaldo se resuelve por la impresora del destino', async () => {
  const { colaRedParaDestino } = await import('../transportes.mjs')
  const colas = [
    { nombre: 'ZKP8008', uri: 'socket://192.168.1.23:9100', tipo: 'red' },
    { nombre: 'Zebra', uri: 'usb://Zebra/ZD220', tipo: 'usb' },
    { nombre: 'SinPuerto', uri: 'socket://192.168.1.30', tipo: 'red' },
  ]
  assert.equal(colaRedParaDestino(colas, 'lan:192.168.1.23:9100'), 'ZKP8008')
  assert.equal(colaRedParaDestino(colas, 'lan:192.168.1.30:9100'), 'SinPuerto', 'sin puerto en la URI vale 9100')
  assert.equal(colaRedParaDestino(colas, 'lan:192.168.1.99:9100'), '')
  assert.equal(colaRedParaDestino(colas, 'cups:ZKP8008'), '', 'un destino por cola no busca equivalente')
  assert.equal(colaRedParaDestino(colas, ''), '')
})

test('el agente imprime al toque cuando la impresora está disponible', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = await puertoLibre()
  const puertoImpresora = await puertoLibre()
  const impresora = await impresoraFalsa(puertoImpresora)
  t.after(() => impresora.cerrar())
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente })
  t.after(() => agente.kill('SIGKILL'))

  const ticket = Buffer.from('TICKET').toString('base64')
  const respuesta = await fetch(`http://127.0.0.1:${puertoAgente}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN },
    body: JSON.stringify({
      data: ticket,
      usuario: 'Dueño',
      ref: 'TEST-ABC-1234',
      tipo: 'prueba-corta',
      validacion: '7318',
      sufijo: '4',
      puente: 'Mac mostrador',
      tokenPista: '1f75…5a8c',
      modo: 'usb',
      ancho: 80,
    }),
  }).then((r) => r.json())
  assert.equal(respuesta.ok, true)
  assert.equal(respuesta.encolado, false)
  assert.ok(await esperar(() => impresora.conDatos().length > 0))
  assert.equal(impresora.conDatos()[0].toString(), 'TICKET')

  // El historial deja trazabilidad: quién imprimió, desde qué equipo y cómo salió.
  const historial = await fetch(`http://127.0.0.1:${puertoAgente}/historial`, { headers: { 'x-mobos-print-token': TOKEN } }).then((r) => r.json())
  assert.equal(historial.historial[0].resultado, 'aceptado')
  assert.equal(historial.historial[0].cliente, '127.0.0.1')
  assert.equal(historial.historial[0].impresora, `lan:127.0.0.1:${puertoImpresora}`)
  assert.equal(historial.historial[0].usuario, 'Dueño')
  assert.equal(historial.historial[0].ref, 'TEST-ABC-1234')
  assert.equal(historial.historial[0].tipo, 'prueba-corta')
  assert.ok(historial.historial[0].bytes > 0)
  // Datos de testeo: quedan registrados para auditar la corrida.
  assert.equal(historial.historial[0].validacion, '7318')
  assert.equal(historial.historial[0].sufijo, '4')
  assert.equal(historial.historial[0].sufijoLargo, 1, 'el historial informa el largo del sufijo para la validación automática (#138)')
  assert.equal(historial.historial[0].puente, 'Mac mostrador')
  assert.equal(historial.historial[0].tokenPista, '1f75…5a8c')
  assert.equal(historial.historial[0].modo, 'usb')
  assert.equal(historial.historial[0].ancho, 80)

  // Confirmación física: el operador vio el papel y lo marca en la app.
  // Primero con un sufijo equivocado: el agente debe rechazarlo.
  const sufijoMalo = await fetch(`http://127.0.0.1:${puertoAgente}/jobs/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN },
    body: JSON.stringify({ id: respuesta.jobId, sufijo: '9' }),
  }).then((r) => r.json())
  assert.equal(sufijoMalo.ok, false)
  assert.equal(sufijoMalo.motivo, 'sufijo-incorrecto')
  const confirmado = await fetch(`http://127.0.0.1:${puertoAgente}/jobs/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN },
    body: JSON.stringify({ id: respuesta.jobId, sufijo: '4' }),
  }).then((r) => r.json())
  assert.equal(confirmado.ok, true)
  const confirmada = await fetch(`http://127.0.0.1:${puertoAgente}/jobs/${respuesta.jobId}`, { headers: { 'x-mobos-print-token': TOKEN } }).then((r) => r.json())
  assert.equal(confirmada.estado, 'confirmado', 'el historial refleja la confirmación en papel')
  const inexistente = await fetch(`http://127.0.0.1:${puertoAgente}/jobs/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN },
    body: JSON.stringify({ id: 'no-existe' }),
  }).then((r) => r.json())
  assert.equal(inexistente.ok, false, 'un ID desconocido no se puede confirmar')

  // La salud informa el nombre del equipo puente (para el ticket de prueba).
  const salud = await fetch(`http://127.0.0.1:${puertoAgente}/health`, { headers: { 'x-mobos-print-token': TOKEN } }).then((r) => r.json())
  assert.equal(typeof salud.equipo, 'string')
  assert.ok(salud.equipo.length > 0)
  const sinToken = await fetch(`http://127.0.0.1:${puertoAgente}/historial`)
  assert.equal(sinToken.status, 401)
})

test('la cola lista, reintenta fallidos y guarda el usuario que imprimió', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = await puertoLibre()
  const puertoImpresora = await puertoLibre()
  const base = `http://127.0.0.1:${puertoAgente}`
  const cabeceras = { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN }
  const ticket = Buffer.from('TICKET-USUARIO').toString('base64')

  // La impresora está apagada y el agente reintenta una sola vez antes de fallar.
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente })
  t.after(() => agente.kill('SIGKILL'))

  const encolado = await fetch(`${base}/print`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ impresora: `lan:127.0.0.1:${puertoImpresora}`, data: ticket, usuario: 'Edgar (VPE)' }) })
  const respuesta = await encolado.json()
  assert.equal(respuesta.encolado, true)

  // La lista de trabajos muestra pendientes con usuario y bytes, sin el ticket.
  const lista = await fetch(`${base}/jobs`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(lista.ok, true)
  assert.equal(lista.pendientes.length, 1)
  assert.equal(lista.pendientes[0].usuario, 'Edgar (VPE)')
  assert.ok(lista.pendientes[0].bytes > 0)
  assert.equal(lista.pendientes[0].data, undefined)

  // Tras agotar los reintentos, el trabajo queda fallido y se puede reintentar.
  // Con la config por defecto (3 intentos, espera clampeada a 1000 ms) cada
  // ciclo cuesta ~2,3 s: 'fallido' llega a los ~6 s. El presupuesto por defecto
  // de `esperar` (6 s) quedaba al límite y era otro flake por timing; se espera
  // por condición con aire y con el estado real en el mensaje.
  const fallido = await esperar(async () => {
    const estado = await fetch(`${base}/jobs`, { headers: cabeceras }).then((r) => r.json())
    return estado.fallidos.length === 1
  }, { intentos: 100, espera: 150 })
  if (!fallido) {
    assert.fail(`el trabajo no quedó fallido sin impresora\n${await pistaDeFallo(agente, base, cabeceras, respuesta.jobId)}`)
  }

  const encendida = await impresoraFalsa(puertoImpresora)
  t.after(() => encendida.cerrar())
  const reintento = await fetch(`${base}/jobs/retry`, { method: 'POST', headers: cabeceras }).then((r) => r.json())
  assert.equal(reintento.ok, true)
  assert.equal(reintento.reintentados, 1)
  // Solo cuentan los bytes impresos: un sondeo de alcance también abre el
  // socket y dejaría una entrada vacía en `recibido`.
  assert.ok(await esperar(() => encendida.conDatos().length > 0, { intentos: 60, espera: 150 }), 'el reintento manual llegó a la impresora')

  // El historial conserva quién imprimió.
  const historial = await fetch(`${base}/historial`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(historial.historial[0].usuario, 'Edgar (VPE)')

  // Diagnóstico con destino explícito (usado al validar impresoras al editar).
  const diagnostico = await fetch(`${base}/diagnostico?destino=lan:127.0.0.1:${puertoImpresora}`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(diagnostico.ok, true)
  assert.equal(diagnostico.alcance, true)

  // El agente acepta ampliar los destinos LAN permitidos vía /config.
  const config = await fetch(`${base}/config`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ lan: [`lan:127.0.0.1:${puertoImpresora}`, 'lan:192.168.1.50:9100'], impresora: `lan:127.0.0.1:${puertoImpresora}` }) }).then((r) => r.json())
  assert.deepEqual(config.lan, [`lan:127.0.0.1:${puertoImpresora}`, 'lan:192.168.1.50:9100'])
  const permitida = await fetch(`${base}/print`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ impresora: 'lan:192.168.1.50:9100', data: ticket }) }).then((r) => r.json())
  assert.equal(permitida.ok, true)
})
