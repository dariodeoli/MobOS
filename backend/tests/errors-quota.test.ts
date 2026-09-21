// #172/#178: cupo diario del reporte público de errores. El minuto frena la
// ráfaga y el día corta el spam sostenido; ambos usan el patrón de
// enforceRateLimit (ventana en memoria por IP, solo con MOBOS_TRUST_PROXY).
// Se ejecuta desde backend/tests/run-unit.cjs (no tiene top-level await).
import assert from 'node:assert/strict'

process.env.MOBOS_TRUST_PROXY = 'true'
process.env.MOBOS_ERRORS_MINUTE_MAX = '3'
process.env.MOBOS_ERRORS_DAILY_MAX = '5'

const { POST } = require('../app/api/errors/route.ts')

const reportar = (ip) => POST(new Request('https://api.example.test/api/errors', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ message: 'prueba de cupo', kind: 'unhandled' }),
}))

;(async () => {
  // IP A: la ráfaga corta en el minuto (3) y el cupo del día (5) la absorbe.
  const ipA = '203.0.113.10'
  const estados = []
  for (let intento = 0; intento < 6; intento += 1) {
    const respuesta = await reportar(ipA)
    estados.push({ status: respuesta.status, retry: Number(respuesta.headers.get('retry-after') || 0) })
  }
  assert.equal(estados[0].status, 200, 'el primer reporte entra')
  assert.equal(estados[2].status, 200, 'el tercer reporte entra')
  assert.equal(estados[3].status, 429, 'el cuarto cae en el límite por minuto')
  assert.ok(estados[3].retry > 0 && estados[3].retry <= 60, 'el límite por minuto pide esperar menos de un minuto')
  assert.equal(estados[5].status, 429, 'al agotar el cupo diario también corta')
  assert.ok(estados[5].retry > 60, 'el cupo diario pide esperar más de un minuto (es el del día)')

  // IP B: cada IP tiene su propio cupo.
  const respuestaB = await reportar('203.0.113.11')
  assert.equal(respuestaB.status, 200, 'otra IP no hereda el cupo agotado')

  console.log('PASS: cupo diario de /api/errors (#172/#178)')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
