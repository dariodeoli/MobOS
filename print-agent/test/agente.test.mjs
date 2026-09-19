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
  proceso.stderr.on('data', (parte) => process.stderr.write(`[agente] ${parte}`))
  const listo = await esperar(() => {
    try {
      const salida = proceso.stdout.read?.()
      return Boolean(salida)
    } catch { return false }
  }, { intentos: 40, espera: 100 })
  assert.ok(listo || proceso.pid, 'el agente arrancó')
  return proceso
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

test('el agente imprime por red, encola si la impresora está caída y protege con token', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = await puertoLibre()
  const puertoImpresora = await puertoLibre()
  const base = `http://127.0.0.1:${puertoAgente}`
  const cabeceras = { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN, Origin: 'https://app.moboss.online' }
  const ticket = Buffer.from([0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a]).toString('base64')

  // Sin impresora todavía: el trabajo queda en la cola.
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente })
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
  assert.ok(await esperar(() => impresora.recibido.length > 0), 'la cola reintentó y llegó a la impresora')
  await new Promise((listo) => setTimeout(listo, 3300)) // deja vencer la caché del sondeo
  const saludEncendida = await fetch(`${base}/health`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(saludEncendida.impresoraOk, true, 'el agente detecta la impresora encendida')
  assert.deepEqual([...impresora.recibido[0]], [0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a])

  // La cola queda vacía y el trabajo figura impreso.
  assert.ok(await esperar(() => readFileSync(join(dir, 'cola.json'), 'utf8').includes('[]')))
  const estado = await fetch(`${base}/jobs/${respuesta.jobId}`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(estado.estado, 'aceptado')

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
  assert.ok(await esperar(async () => {
    const estado = await fetch(`${base}/jobs`, { headers: cabeceras }).then((r) => r.json())
    return estado.fallidos.length === 1
  }), 'el trabajo terminó fallido sin impresora')

  const encendida = await impresoraFalsa(puertoImpresora)
  t.after(() => encendida.cerrar())
  const reintento = await fetch(`${base}/jobs/retry`, { method: 'POST', headers: cabeceras }).then((r) => r.json())
  assert.equal(reintento.ok, true)
  assert.equal(reintento.reintentados, 1)
  assert.ok(await esperar(() => encendida.recibido.length > 0), 'el reintento manual llegó a la impresora')

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
