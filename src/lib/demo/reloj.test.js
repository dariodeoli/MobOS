import assert from 'node:assert/strict'
import test from 'node:test'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { diaDemo, instanteDemo } from './reloj.js'
import { VENTAS_DEMO, ventasDemoLegacy, pedidosDemoDeCliente } from './ventas.js'
import { generarVentasHistorial } from './ventasHistorial.js'

const relojes = [
  ['madrugada', '2026-10-15T04:00:00.321Z', '2026-10-15'],
  ['medianoche UTC aún es ayer en Paraguay', '2026-10-15T00:00:00.000Z', '2026-10-14'],
  ['medianoche Paraguay', '2026-10-15T03:00:00.000Z', '2026-10-15'],
  ['fin de mes', '2026-11-01T02:59:59.999Z', '2026-10-31'],
  ['fin de año', '2027-01-01T02:59:59.999Z', '2026-12-31'],
  ['inicio de año', '2027-01-01T03:00:00.000Z', '2027-01-01'],
  ['año bisiesto', '2028-03-01T02:59:59.999Z', '2028-02-29'],
]
for (const [caso, iso, dia] of relojes) test(`demo sin fechas futuras: ${caso}`, () => {
  const ahora = new Date(iso)
  assert.equal(diaDemo(0, ahora), dia)
  const ventas = ventasDemoLegacy(ahora)
  assert.equal(ventas.length, VENTAS_DEMO.length)
  for (const venta of ventas) {
    assert.ok(venta.fecha <= dia, venta.id)
    assert.ok(Date.parse(venta.creadoEn) <= ahora.getTime(), venta.id)
    assert.equal(diaDemo(0, new Date(venta.creadoEn)), venta.fecha, venta.id)
    for (const pago of venta.pagos) assert.ok(Date.parse(pago.fecha) <= ahora.getTime(), pago.id)
  }
  for (const clienteId of new Set(VENTAS_DEMO.map(venta => venta.clienteId))) {
    for (const pedido of pedidosDemoDeCliente(clienteId, ahora)) {
      const legacy = ventas.find(venta => venta.id === pedido.id)
      assert.equal(pedido.createdAt, legacy.creadoEn)
      assert.deepEqual(pedido.pagos.map(pago => pago.paidAt), legacy.pagos.map(pago => pago.fecha))
      for (const pago of pedido.pagos) assert.ok(Date.parse(pago.paidAt) <= ahora.getTime())
    }
  }
})

test('el reloj solo cambia fechas: preserva IDs, números, ítems, montos, pagos y estados', () => {
  const sinFechas = venta => {
    const { fecha, creadoEn, pagos, ...datos } = venta
    return { ...datos, pagos: pagos.map(({ fecha, ...pago }) => pago) }
  }
  const temprano = ventasDemoLegacy(new Date('2026-10-15T03:00:00Z')).map(sinFechas)
  const tarde = ventasDemoLegacy(new Date('2026-10-15T23:59:59Z')).map(sinFechas)
  assert.deepEqual(temprano, tarde)
  assert.ok(VENTAS_DEMO.some(venta => venta.diasAtras >= 119))
  assert.ok(new Set(VENTAS_DEMO.map(venta => venta.diasAtras)).size > 110)
})

test('calendario cruza mes/año sin depender del día UTC y conserva las horas pasadas', () => {
  assert.equal(diaDemo(1, new Date('2027-01-01T03:00:00Z')), '2026-12-31')
  assert.equal(diaDemo(1, new Date('2028-03-01T03:00:00Z')), '2028-02-29')
  assert.equal(instanteDemo(0, 0, 0, new Date('2026-10-15T04:00:00Z')), '2026-10-15T03:00:00.000Z')
  assert.equal(instanteDemo(1, 10, 15, new Date('2026-10-15T04:00:00Z')), '2026-10-14T13:15:00.000Z')
  assert.equal(instanteDemo(0, 23, 59, new Date('2026-10-15T04:00:00.321Z')), '2026-10-15T04:00:00.321Z')
})

test('historial: misma semilla y día de Paraguay conservan diversidad, IDs y montos', () => {
  const antesUtc = generarVentasHistorial({ hoy: new Date('2026-10-14T23:59:59Z') })
  const despuesUtc = generarVentasHistorial({ hoy: new Date('2026-10-15T00:00:00Z') })
  assert.deepEqual(antesUtc, despuesUtc)
  assert.ok(new Set(antesUtc.map(venta => venta.diasAtras)).size > 110)
})

test('las ventas e historial son iguales en dispositivos UTC, Tokio y Los Ángeles', () => {
  const ventasUrl = new URL('./ventas.js', import.meta.url).href
  const historialUrl = new URL('./ventasHistorial.js', import.meta.url).href
  const script = `import {ventasDemoLegacy} from ${JSON.stringify(ventasUrl)}; import {generarVentasHistorial} from ${JSON.stringify(historialUrl)}; const ahora=new Date('2027-01-01T00:00:00Z'); console.log(JSON.stringify([ventasDemoLegacy(ahora),generarVentasHistorial({hoy:ahora})]));`
  const resultados = ['UTC', 'Asia/Tokyo', 'America/Los_Angeles'].map(TZ => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, maxBuffer: 5 * 1024 * 1024 }).toString())
  assert.equal(resultados[0], resultados[1])
  assert.equal(resultados[0], resultados[2])
})
