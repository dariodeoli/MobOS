import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as crearServidorSocket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { crearCola } from '../cola.mjs'
import { aplicarConfigRemota, calcularBackoff, canjearCodigo, crearRemoto } from '../remoto.mjs'
import { enviar } from '../transportes.mjs'

const TOKEN = 'token-falso-del-puente'

// Puerto libre para no chocar con otras corridas.
function puertoLibre() {
  return new Promise((resolve) => {
    const servidor = crearServidorSocket()
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      servidor.close(() => resolve(port))
    })
  })
}

// Impresora térmica falsa: cuenta los bytes que recibe por socket.
async function impresoraFalsa() {
  const puerto = await puertoLibre()
  const recibido = []
  const servidor = crearServidorSocket((socket) => {
    const partes = []
    socket.on('data', (parte) => partes.push(parte))
    socket.on('end', () => recibido.push(Buffer.concat(partes)))
  })
  return new Promise((resolve) => {
    servidor.listen(puerto, '127.0.0.1', () => resolve({
      puerto,
      recibido,
      conDatos: () => recibido.filter((buffer) => buffer.length > 0),
      cerrar: () => new Promise((listo) => servidor.close(listo)),
    }))
  })
}

// Backend falso del puente: claim, heartbeat, result, config y pair con estado
// mutable para simular caídas y reconciliación.
async function backendFalso() {
  const estado = {
    trabajos: [],
    resultados: [],
    latidos: [],
    pedidos: [],
    config: { printers: [], lan: [], defaultPrinterId: null, lanCups: 'MobOS_LAN', impresora: '', ancho: 80, copias: 1, version: '', remoteEnabled: true },
    fallarClaim: false,
    fallarResultado: false,
    pairError: false,
  }
  const servidor = createServer((request, response) => {
    const partes = []
    request.on('data', (parte) => partes.push(parte))
    request.on('end', () => {
      let cuerpo = {}
      try { cuerpo = partes.length ? JSON.parse(Buffer.concat(partes).toString('utf8')) : {} } catch { cuerpo = {} }
      const url = new URL(request.url, 'http://127.0.0.1')
      estado.pedidos.push({ ruta: url.pathname, cuerpo, authorization: String(request.headers.authorization || '') })
      const responder = (status, datos) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(datos)) }
      if (url.pathname === '/api/print/bridge/claim') {
        if (estado.fallarClaim) return responder(500, { error: 'La impresión remota está caída.' })
        const trabajo = estado.trabajos.shift()
        return responder(200, { jobs: trabajo ? [trabajo] : [] })
      }
      if (url.pathname === '/api/print/bridge/heartbeat') {
        estado.latidos.push(cuerpo)
        return responder(200, { ok: true, serverTime: new Date().toISOString() })
      }
      if (url.pathname === '/api/print/bridge/config') return responder(200, estado.config)
      if (url.pathname === '/api/print/bridge/pair') {
        if (estado.pairError) return responder(401, { error: 'Código de vinculación inválido o vencido.' })
        return responder(201, { token: TOKEN, bridgeId: 'puente-1' })
      }
      if (url.pathname.startsWith('/api/print/bridge/jobs/') && url.pathname.endsWith('/result')) {
        if (estado.fallarResultado) return responder(500, { error: 'Backend caído.' })
        estado.resultados.push({ id: url.pathname.split('/')[5], ...cuerpo })
        return responder(200, { ok: true, applied: true, state: cuerpo.state })
      }
      return responder(404, { error: 'Ruta no encontrada.' })
    })
  })
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address()
      resolve({
        estado,
        url: `http://127.0.0.1:${port}`,
        cerrar: () => new Promise((listo) => servidor.close(listo)),
      })
    })
  })
}

const trabajoRemoto = ({ id, destino, payload, copies = 1 }) => ({
  id,
  printerId: null,
  destination: destino,
  kind: 'prueba',
  payload,
  payloadBytes: Buffer.from(payload, 'base64').length,
  validation: '7318',
  reference: `REF-${id}`,
  requestedByName: 'Dueño',
  deviceName: 'Tablet',
  bridgeName: 'Mac mostrador',
  tokenHint: '1f75…5a8c',
  mode: 'remoto',
  width: 80,
  copies,
  attempts: 1,
  leaseId: `lease-${id}`,
  leaseExpiresAt: new Date(Date.now() + 120000).toISOString(),
})

function colaEn(dir) {
  return crearCola({ ruta: join(dir, 'cola.json'), rutaHistorial: join(dir, 'historial.json'), enviar: async () => true })
}

async function esperar(condicion, { intentos = 60, espera = 100 } = {}) {
  for (let i = 0; i < intentos; i += 1) {
    if (await condicion()) return true
    await new Promise((listo) => setTimeout(listo, espera))
  }
  return false
}

test('el backoff crece 2→4→8→16→30 s con jitter de ±20 %', () => {
  const sinJitter = () => 0.5
  assert.equal(calcularBackoff(1, 2000, 30000, sinJitter), 2000)
  assert.equal(calcularBackoff(2, 2000, 30000, sinJitter), 4000)
  assert.equal(calcularBackoff(3, 2000, 30000, sinJitter), 8000)
  assert.equal(calcularBackoff(4, 2000, 30000, sinJitter), 16000)
  assert.equal(calcularBackoff(5, 2000, 30000, sinJitter), 30000)
  assert.equal(calcularBackoff(9, 2000, 30000, sinJitter), 30000)
  assert.equal(calcularBackoff(2, 2000, 30000, () => 0), 3200)
  assert.equal(calcularBackoff(2, 2000, 30000, () => 1), 4800)
})

test('reclama, imprime por el transporte real y reporta una sola vez', async (t) => {
  const backend = await backendFalso()
  const impresora = await impresoraFalsa()
  t.after(() => { backend.cerrar(); impresora.cerrar() })
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-'))
  const cola = colaEn(dir)
  const ticket = Buffer.from('REMOTO-1')
  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-1', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: ticket.toString('base64') }))
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola, enviar, log: () => {}, baseMs: 40, maxMs: 200, latidoMs: 50 })
  t.after(() => remoto.detener())

  await remoto.iniciar()
  assert.ok(await esperar(() => backend.estado.resultados.length === 1), 'reportó el resultado')
  assert.ok(await esperar(() => impresora.conDatos().length === 1), 'imprimió una sola vez')
  remoto.detener()
  assert.deepEqual([...impresora.conDatos()[0]], [...ticket])
  assert.deepEqual(backend.estado.resultados[0], { id: 'job-1', leaseId: 'lease-job-1', state: 'ACEPTADO', transport: 'directo' })
  assert.equal(cola.pendientesDeReporte().length, 0)
  // Todos los pedidos del poller van autenticados con el Bearer del puente.
  assert.ok(backend.estado.pedidos.every((pedido) => pedido.authorization === `Bearer ${TOKEN}`), 'sin token no hay pedidos')
  // La config se sincroniza sin navegador abierto.
  assert.ok(backend.estado.pedidos.some((pedido) => pedido.ruta === '/api/print/bridge/config'))
})

test('tras un reinicio el mismo trabajo no se reimprime (dedupe por id)', async (t) => {
  const backend = await backendFalso()
  const impresora = await impresoraFalsa()
  t.after(() => { backend.cerrar(); impresora.cerrar() })
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-dedupe-'))
  const trabajo = trabajoRemoto({ id: 'job-2', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: Buffer.from('REMOTO-2').toString('base64') })

  // Primer arranque: imprime y no puede reportar (backend caído).
  backend.estado.trabajos.push(trabajo)
  backend.estado.fallarResultado = true
  const primero = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 40, maxMs: 100 })
  await primero.iniciar()
  assert.ok(await esperar(() => primero.pendientesDeReporte().length === 1), 'el resultado quedó en el outbox')
  primero.detener()
  assert.ok(await esperar(() => impresora.conDatos().length === 1), 'imprimió antes de caerse el backend')

  // Reinicio: el backend vuelve a entregar el mismo id y además se recupera.
  backend.estado.fallarResultado = false
  backend.estado.trabajos.push(trabajo)
  const segundo = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 40, maxMs: 100 })
  await segundo.iniciar()
  assert.ok(await esperar(() => segundo.pendientesDeReporte().length === 0), 'reportó el pendiente al volver')
  await new Promise((listo) => setTimeout(listo, 150))
  segundo.detener()
  assert.equal(impresora.conDatos().length, 1, 'el reclamado repetido no se reimprime')
  assert.equal(backend.estado.resultados.length, 1, 'se reportó una sola vez')
})

test('con el backend caído el outbox sobrevive y se reporta antes de reclamar', async (t) => {
  const backend = await backendFalso()
  const impresora = await impresoraFalsa()
  t.after(() => { backend.cerrar(); impresora.cerrar() })
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-outbox-'))
  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-3', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: Buffer.from('REMOTO-3').toString('base64') }))
  backend.estado.fallarResultado = true
  const primero = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 30, maxMs: 120 })
  await primero.iniciar()
  assert.ok(await esperar(() => primero.pendientesDeReporte().length === 1))
  assert.ok(await esperar(() => primero.estado().backoffMs >= 30), 'un fallo de reporte aplica backoff')
  primero.detener()
  const guardado = JSON.parse(readFileSync(join(dir, 'cola.json'), 'utf8'))
  assert.equal(guardado[0].data, '', 'el payload no se conserva')

  backend.estado.fallarResultado = false
  const desde = backend.estado.pedidos.length
  const segundo = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 30, maxMs: 120 })
  await segundo.iniciar()
  await esperar(() => segundo.pendientesDeReporte().length === 0)
  segundo.detener()
  const pedidos = backend.estado.pedidos.slice(desde).map((pedido) => pedido.ruta)
  assert.ok(pedidos[0].endsWith('/result'), `primero reporta, después reclama: ${pedidos.join(' → ')}`)
  assert.equal(backend.estado.resultados.length, 1)
})

test('un trabajo lento se mantiene con latidos que extienden el lease', async (t) => {
  const backend = await backendFalso()
  const impresora = await impresoraFalsa()
  t.after(() => { backend.cerrar(); impresora.cerrar() })
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-latido-'))
  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-4', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: Buffer.from('REMOTO-4').toString('base64') }))
  const enviarLento = async (destino, bytes) => {
    await new Promise((listo) => setTimeout(listo, 150))
    return enviar(destino, bytes)
  }
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar: enviarLento, log: () => {}, baseMs: 40, maxMs: 120, latidoMs: 25, version: '1.6.0' })
  t.after(() => remoto.detener())
  await remoto.iniciar()
  assert.ok(await esperar(() => backend.estado.latidos.some((latido) => latido.jobId === 'job-4')), 'latió con el trabajo en curso')
  assert.ok(await esperar(() => backend.estado.resultados.length === 1), 'terminó y reportó la impresión lenta')
  remoto.detener()
  const latido = backend.estado.latidos.find((item) => item.jobId === 'job-4')
  assert.equal(latido.version, '1.6.0')
  assert.ok(latido.platform)
  assert.equal(backend.estado.resultados[0].id, 'job-4')
})

test('acepta destinos usb: legacy y los pasa al transporte', async (t) => {
  const backend = await backendFalso()
  t.after(() => backend.cerrar())
  const destinos = []
  const enviarFalso = async (destino) => { destinos.push(destino); return 'usb' }
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-usb-'))
  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-5', destino: 'usb:CUPS_FALSA', payload: Buffer.from('REMOTO-5').toString('base64') }))
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar: enviarFalso, log: () => {}, baseMs: 40, maxMs: 120 })
  await remoto.iniciar()
  assert.ok(await esperar(() => destinos.length === 1))
  assert.ok(await esperar(() => backend.estado.resultados.length === 1))
  remoto.detener()
  assert.equal(destinos[0], 'usb:CUPS_FALSA')
  assert.equal(backend.estado.resultados[0].transport, 'usb')
})

test('reclama varias copias del mismo trabajo y sin payload reporta fallido', async (t) => {
  const backend = await backendFalso()
  const impresora = await impresoraFalsa()
  t.after(() => { backend.cerrar(); impresora.cerrar() })
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-copias-'))
  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-6', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: Buffer.from('X').toString('base64'), copies: 2 }))
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 40, maxMs: 120 })
  await remoto.iniciar()
  assert.ok(await esperar(() => backend.estado.resultados.length === 1))
  remoto.detener()
  assert.equal(impresora.conDatos().length, 2, 'imprime una vez por copia')
  assert.equal(backend.estado.resultados[0].state, 'ACEPTADO')

  backend.estado.trabajos.push(trabajoRemoto({ id: 'job-7', destino: `lan:127.0.0.1:${impresora.puerto}`, payload: '' }))
  const segundo = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar, log: () => {}, baseMs: 40, maxMs: 120 })
  await segundo.iniciar()
  assert.ok(await esperar(() => backend.estado.resultados.length === 2))
  segundo.detener()
  assert.equal(backend.estado.resultados[1].state, 'FALLIDO')
  assert.equal(impresora.conDatos().length, 2, 'un trabajo sin payload no imprime nada')
})

test('sin backend el poller no crashea, aplica backoff y se recupera solo', async (t) => {
  const backend = await backendFalso()
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-caida-'))
  backend.estado.fallarClaim = true
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar: async () => 'directo', log: () => {}, baseMs: 30, maxMs: 90 })
  await remoto.iniciar()
  assert.ok(remoto.estado().backoffMs >= 30, 'aplica backoff tras el fallo')
  backend.estado.fallarClaim = false
  assert.ok(await esperar(() => backend.estado.pedidos.filter((pedido) => pedido.ruta === '/api/print/bridge/claim').length >= 1))
  await esperar(() => remoto.estado().backoffMs === 0)
  remoto.detener()
  backend.cerrar()
  assert.equal(remoto.estado().activo, false)
})

test('la config del backend se aplica al agente y lo ausente se conserva', async (t) => {
  const backend = await backendFalso()
  t.after(() => backend.cerrar())
  backend.estado.config = {
    printers: [{ id: 'p1', name: 'Mostrador', destination: 'lan:192.168.1.23:9100', connection: 'lan', isActive: true, isDefault: true }],
    lan: ['lan:192.168.1.23:9100'],
    defaultPrinterId: 'p1',
    lanCups: 'MobOS_LAN',
    impresora: 'lan:192.168.1.23:9100',
    ancho: 80,
    copias: 2,
    version: '1.6.0',
    remoteEnabled: true,
  }
  const dir = mkdtempSync(join(tmpdir(), 'mobos-remoto-config-'))
  const config = { impresora: '', ancho: 58, copias: 1, lan: [], lanCups: 'MobOS_LAN' }
  const remoto = crearRemoto({ apiUrl: backend.url, token: TOKEN, cola: colaEn(dir), enviar: async () => 'directo' })
  const datos = await remoto.sincronizarConfig((valor) => aplicarConfigRemota(config, valor))
  assert.deepEqual(datos.lan, ['lan:192.168.1.23:9100'])
  assert.equal(config.impresora, 'lan:192.168.1.23:9100')
  assert.equal(config.ancho, 80)
  assert.equal(config.copias, 2)
  // Un payload incompleto no pisa la configuración vigente.
  aplicarConfigRemota(config, {})
  assert.equal(config.impresora, 'lan:192.168.1.23:9100')
  assert.equal(config.copias, 2)
})

test('pair.mjs canjea el código, guarda apiUrl y token, y nunca loguea el token', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-pair-'))
  process.env.MOBOS_PRINT_DIR = dir
  const { normalizarCodigo, vincular } = await import('../pair.mjs')
  const backend = await backendFalso()
  t.after(() => backend.cerrar())

  // Normalización espejo del backend: minúsculas, espacios y confusiones I/L/O.
  assert.equal(normalizarCodigo('abcde fghjk'), 'ABCDE-FGHJK')
  assert.equal(normalizarCodigo('ABCDE-FGHIK'), 'ABCDE-FGH1K')
  assert.equal(normalizarCodigo('corto'), null)

  // Código inválido: no pide token ni escribe configuración.
  await assert.rejects(() => vincular({ code: 'corto', apiUrl: backend.url, log: () => {} }), /no es válido/)
  assert.equal(existsSync(join(dir, 'config.json')), false)

  // Código válido: persiste el vínculo y no filtra el token en el log.
  const registros = []
  const { bridgeId } = await vincular({ code: 'abcde fghjk', apiUrl: backend.url, version: '1.6.0', log: (mensaje) => registros.push(String(mensaje)) })
  assert.equal(bridgeId, 'puente-1')
  const guardado = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
  assert.equal(guardado.apiUrl, backend.url)
  assert.equal(guardado.bridgeToken, TOKEN)
  assert.equal(guardado.remotoActivo, true)
  assert.equal(statSync(join(dir, 'config.json')).mode & 0o777, 0o600)
  assert.ok(!registros.join(' ').includes(TOKEN), 'el token nunca va al log')

  // Un backend que rechaza el canje deja la configuración intacta.
  backend.estado.pairError = true
  await assert.rejects(() => vincular({ code: 'ABCDE-FGHJK', apiUrl: backend.url, log: () => {} }), /inválido o vencido/)
  assert.equal(JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8')).bridgeToken, TOKEN)

  backend.estado.pairError = false
  const directo = await canjearCodigo({ apiUrl: backend.url, code: 'ABCDE-FGHJK', fetchImpl: fetch })
  assert.equal(directo.token, TOKEN)
})
