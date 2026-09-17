import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const TOKEN = 'token-de-prueba'

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
      cerrar: () => new Promise((listo) => servidor.close(listo)),
    }))
  })
}

async function esperar(condicion, { intentos = 40, espera = 150 } = {}) {
  for (let i = 0; i < intentos; i += 1) {
    if (condicion()) return true
    await new Promise((listo) => setTimeout(listo, espera))
  }
  return false
}

async function arrancarAgente(dir, { impresora, puerto }) {
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ puerto, token: TOKEN, impresora, ancho: 58, copias: 1, reintentos: 3, esperaMs: 500, lan: [impresora] }))
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

test('el agente imprime por red, encola si la impresora está caída y protege con token', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = 17891
  const puertoImpresora = 19100
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
  assert.deepEqual([...impresora.recibido[0]], [0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a])

  // La cola queda vacía y el trabajo figura impreso.
  assert.ok(await esperar(() => readFileSync(join(dir, 'cola.json'), 'utf8').includes('[]')))
  const estado = await fetch(`${base}/jobs/${respuesta.jobId}`, { headers: cabeceras }).then((r) => r.json())
  assert.equal(estado.estado, 'impreso')

  // El preflight de red local responde con el header que pide Chrome.
  const preflight = await fetch(`${base}/print`, { method: 'OPTIONS', headers: { Origin: 'https://app.moboss.online', 'Access-Control-Request-Method': 'POST' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true')
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.moboss.online')
})

test('el agente imprime al toque cuando la impresora está disponible', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'mobos-print-'))
  const puertoAgente = 17892
  const puertoImpresora = 19101
  const impresora = await impresoraFalsa(puertoImpresora)
  t.after(() => impresora.cerrar())
  const agente = await arrancarAgente(dir, { impresora: `lan:127.0.0.1:${puertoImpresora}`, puerto: puertoAgente })
  t.after(() => agente.kill('SIGKILL'))

  const ticket = Buffer.from('TICKET').toString('base64')
  const respuesta = await fetch(`http://127.0.0.1:${puertoAgente}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mobos-print-token': TOKEN },
    body: JSON.stringify({ data: ticket }),
  }).then((r) => r.json())
  assert.equal(respuesta.ok, true)
  assert.equal(respuesta.encolado, false)
  assert.ok(await esperar(() => impresora.recibido.length > 0))
  assert.equal(impresora.recibido[0].toString(), 'TICKET')
})
