import assert from 'node:assert/strict'
import test from 'node:test'
import { crearFiltroLogWeb } from '../../scripts/filtro-log-web.mjs'

// Guarda del filtro del log del backend en el harness e2e (#CI): resume el
// ruido conocido de Next dev (requests cortadas por el cliente) sin comerse
// errores reales ni el resto del log.

const ABORTO = [
  ' ⨯ uncaughtException: Error: aborted',
  '    at abortIncoming (node:_http_server:921:17)',
  '    at socketOnClose (node:_http_server:914:3)',
  '    at Socket.emit (node:events:526:24)',
  '    at TCP.<anonymous> (node:net:362:12) {',
  "  code: 'ECONNRESET'",
  '}',
]

function filtrar(lineas) {
  const filtro = crearFiltroLogWeb()
  const salida = []
  for (const linea of lineas) salida.push(...filtro.linea(linea))
  salida.push(...filtro.cerrar())
  return salida
}

test('resume los abortos del cliente y no se come el resto del log', () => {
  const salida = filtrar(['antes', ...ABORTO, 'después'])
  assert.deepEqual(salida.filter((linea) => linea.includes('abortIncoming')), [])
  assert.deepEqual(salida.filter((linea) => linea.includes('uncaughtException')), [])
  assert.deepEqual(salida.filter((linea) => linea === 'antes' || linea === 'después'), ['antes', 'después'])
  const resumenes = salida.filter((linea) => linea.includes('request(s) cortada(s)'))
  assert.equal(resumenes.length, 1)
  assert.match(resumenes[0], /1 request\(s\)/)
})

test('resume varios abortos seguidos en una sola línea', () => {
  const salida = filtrar(['hola', ...ABORTO, ...ABORTO, 'chau'])
  const resumenes = salida.filter((linea) => linea.includes('request(s) cortada(s)'))
  assert.equal(resumenes.length, 1)
  assert.match(resumenes[0], /2 request\(s\)/)
  assert.deepEqual(salida.filter((linea) => !linea.includes('request(s) cortada(s)')), ['hola', 'chau'])
})

test('no filtra un Error: aborted con stack propio de la app', () => {
  const propio = [
    ' ⨯ Error: aborted',
    '    at subirArchivo (webpack-internal:///(rsc)/./app/api/upload/route.ts:12:9)',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
  ]
  assert.deepEqual(filtrar([...propio, 'siguiente']), [...propio, 'siguiente'])
})

test('el log normal pasa intacto', () => {
  const normal = ['{"level":"info","msg":"listo"}', ' ✓ Compiled /inventario in 850ms (1204 modules)']
  assert.deepEqual(filtrar(normal), normal)
})
