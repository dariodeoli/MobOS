import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clasificarConflicto,
  crearColaDeVentas,
  esErrorDeRed,
  metricasDeCola,
  ESTADO_CONFLICTO,
  ESTADO_ENVIADA,
  ESTADO_PENDIENTE,
} from './queue.js'

function storeEnMemoria() {
  const filas = new Map()
  return {
    filas,
    async listar() { return [...filas.values()] },
    async guardar(item) { filas.set(item.id, { ...item }) },
    async borrar(id) { filas.delete(id) },
  }
}

const venta = (n) => ({
  payload: { offline: true, items: [{ description: `Producto ${n}`, quantity: 1, unitPricePyg: 1000 }] },
  idempotencyKey: `pos-offline-${n}`,
  resumen: { cliente: `Cliente ${n}`, total: 1000 },
})

test('encola la venta con su clave de idempotencia y la lista en orden', async () => {
  let reloj = 1000
  const cola = crearColaDeVentas({ store: storeEnMemoria(), enviar: async () => ({}), ahora: () => (reloj += 1) })
  await cola.encolar(venta(1))
  await cola.encolar(venta(2))
  const items = await cola.listar()
  assert.equal(items.length, 2)
  assert.equal(items[0].estado, ESTADO_PENDIENTE)
  assert.equal(items[0].idempotencyKey, 'pos-offline-1')
  assert.equal(items[0].payload.offline, true)
  assert.ok(items[0].creadoEn < items[1].creadoEn)
  const r = await cola.resumen()
  assert.deepEqual({ pendientes: r.pendientes, conflictos: r.conflictos, enviadas: r.enviadas }, { pendientes: 2, conflictos: 0, enviadas: 0 })
})

test('sincroniza reutilizando la clave y deja el historial de enviadas', async () => {
  const store = storeEnMemoria()
  const enviadas = []
  const cola = crearColaDeVentas({
    store,
    ahora: (() => { let t = 10; return () => (t += 5) })(),
    enviar: async (item) => { enviadas.push(item.idempotencyKey); return { id: `orden-${item.idempotencyKey}` } },
  })
  await cola.encolar(venta(1))
  await cola.encolar(venta(2))
  const resumen = await cola.sincronizar()
  assert.deepEqual(enviadas, ['pos-offline-1', 'pos-offline-2'], 'cada venta viaja una sola vez con su clave')
  assert.equal(resumen.pendientes, 0)
  assert.equal(resumen.enviadas, 2)
  assert.ok(resumen.ultimaSync)
  const items = await cola.listar()
  assert.ok(items.every((item) => item.estado === ESTADO_ENVIADA))
  assert.equal(items[0].ordenId, 'orden-pos-offline-1')
})

test('un corte de red deja la venta pendiente y reintenta después', async () => {
  const store = storeEnMemoria()
  let sinRed = true
  const cola = crearColaDeVentas({
    store,
    enviar: async () => {
      if (sinRed) throw Object.assign(new Error('No se pudo conectar con la API.'), { code: 'NETWORK_ERROR', status: 0 })
      return { id: 'orden-ok' }
    },
  })
  await cola.encolar(venta(1))
  const primero = await cola.sincronizar()
  assert.equal(primero.pendientes, 1)
  assert.equal(primero.conflictos, 0)
  const [pendiente] = await cola.pendientes()
  assert.equal(pendiente.intentos, 1)
  assert.match(pendiente.error, /Sin conexión/)
  sinRed = false
  const segundo = await cola.sincronizar()
  assert.equal(segundo.pendientes, 0)
  assert.equal(segundo.enviadas, 1)
})

test('un rechazo del servidor queda como conflicto y no se reintenta solo', async () => {
  const store = storeEnMemoria()
  let llamadas = 0
  const cola = crearColaDeVentas({
    store,
    enviar: async () => {
      llamadas += 1
      throw Object.assign(new Error('Stock insuficiente: Cable.'), { status: 409, code: 'API_ERROR' })
    },
  })
  await cola.encolar(venta(1))
  const resumen = await cola.sincronizar()
  assert.equal(resumen.conflictos, 1)
  assert.equal(resumen.pendientes, 0)
  assert.equal(llamadas, 1)
  const [conflicto] = (await cola.listar()).filter((item) => item.estado === ESTADO_CONFLICTO)
  assert.match(conflicto.error, /Stock insuficiente/)
  // Reintento manual: vuelve a pendiente y conserva la clave y el payload.
  await cola.reintentar(conflicto.id)
  const [reintentada] = await cola.pendientes()
  assert.equal(reintentada.idempotencyKey, 'pos-offline-1')
  assert.equal(reintentada.payload.offline, true)
})

test('sin red no sigue con el resto de la cola y el historial queda acotado', async () => {
  const store = storeEnMemoria()
  let llamadas = 0
  const cola = crearColaDeVentas({
    store,
    maxHistorial: 2,
    enviar: async () => {
      llamadas += 1
      throw Object.assign(new Error('sin red'), { code: 'NETWORK_ERROR' })
    },
  })
  await cola.encolar(venta(1))
  await cola.encolar(venta(2))
  await cola.sincronizar()
  assert.equal(llamadas, 1, 'corta al primer error de red')

  // Con el envío sano, el historial de enviadas se acota a maxHistorial.
  const store2 = storeEnMemoria()
  const cola2 = crearColaDeVentas({ store: store2, maxHistorial: 2, enviar: async () => ({ id: 'x' }) })
  for (let i = 1; i <= 4; i += 1) await cola2.encolar(venta(i))
  const resumen = await cola2.sincronizar()
  assert.equal(resumen.enviadas, 2, 'solo se conservan las últimas enviadas')
  assert.equal(resumen.total, 2)
})

test('esErrorDeRed distingue corte de red de respuesta del servidor', () => {
  assert.equal(esErrorDeRed(Object.assign(new Error('x'), { code: 'NETWORK_ERROR', status: 0 })), true)
  assert.equal(esErrorDeRed(Object.assign(new Error('x'), { code: 'REQUEST_TIMEOUT' })), true)
  assert.equal(esErrorDeRed(new TypeError('Failed to fetch')), true)
  assert.equal(esErrorDeRed(Object.assign(new Error('rechazada'), { status: 409 })), false)
  assert.equal(esErrorDeRed(Object.assign(new Error('permiso'), { status: 403 })), false)
  assert.equal(esErrorDeRed(null), false)
})

test('clasifica el motivo del conflicto para poder resolverlo', () => {
  assert.equal(clasificarConflicto(new Error('Stock insuficiente: Cable.')).tipo, 'stock')
  assert.equal(clasificarConflicto(new Error('El precio del cupón cambió o fue alterado.')).tipo, 'precio')
  assert.equal(clasificarConflicto(Object.assign(new Error('Ya existe una orden con ese identificador.'), { status: 409 })).tipo, 'duplicada')
  assert.equal(clasificarConflicto(Object.assign(new Error('No autorizado.'), { status: 403 })).tipo, 'permiso')
  assert.equal(clasificarConflicto(Object.assign(new Error('no se conecta'), { code: 'NETWORK_ERROR' })).tipo, 'red')
  assert.equal(clasificarConflicto(new Error('cualquier cosa')).tipo, 'otro')
  assert.match(clasificarConflicto(new Error('Stock insuficiente')).sugerencia, /stock|sobre pedido/i)
})

test('la cola rechaza más ventas que el límite configurado', async () => {
  const store = storeEnMemoria()
  const cola = crearColaDeVentas({ store, enviar: async () => ({}), maxCola: 2 })
  await cola.encolar(venta(1))
  await cola.encolar(venta(2))
  await assert.rejects(() => cola.encolar(venta(3)), /límite 2/)
  // Al sincronizar, las enviadas no cuentan para el límite.
  await cola.sincronizar()
  await cola.encolar(venta(3))
  const items = await cola.listar()
  assert.equal(items.filter((item) => item.estado === 'enviada').length, 2)
})

test('una venta que esperó demasiado pasa a conflicto vencido (no se pierde)', async () => {
  const store = storeEnMemoria()
  let reloj = 1000
  const cola = crearColaDeVentas({ store, enviar: async () => ({ id: 'x' }), ahora: () => reloj, diasExpiracion: 7 })
  await cola.encolar(venta(1))
  reloj += 8 * 86400000 // pasan 8 días sin conexión
  const resumen = await cola.limpiar()
  assert.equal(resumen.pendientes, 0)
  assert.equal(resumen.conflictos, 1)
  const [item] = await cola.listar()
  assert.equal(item.tipo, 'expirada')
  assert.match(item.error, /más de 7 día/)
  // Reintentarla a mano la devuelve a pendiente con vencimiento nuevo.
  await cola.reintentar(item.id)
  const [reintentada] = await cola.pendientes()
  assert.equal(reintentada.tipo, '')
  assert.ok(reintentada.expiraEn > reloj)
})

test('el reporte mide lo vendido offline, el tiempo de sync y la tasa de éxito', async () => {
  const store = storeEnMemoria()
  let reloj = 0
  const cola = crearColaDeVentas({
    store,
    ahora: () => reloj,
    enviar: async (item) => {
      if (item.idempotencyKey === 'pos-offline-2') throw new Error('Stock insuficiente: Cable.')
      reloj += 5000
      return { id: 'ok' }
    },
  })
  await cola.encolar(venta(1))
  await cola.encolar(venta(2))
  await cola.sincronizar()
  const reporte = await cola.reporte()
  assert.equal(reporte.total, 2)
  assert.equal(reporte.enviadas, 1)
  assert.equal(reporte.conflictos, 1)
  assert.equal(reporte.porTipo.stock, 1)
  assert.equal(reporte.vendidoPyg, 2000, 'lo vendido offline suma aunque no se haya sincronizado')
  assert.equal(reporte.sincronizadoPyg, 1000)
  assert.equal(reporte.tiempoPromedioMs, 5000)
  assert.equal(reporte.tasaExito, 50)
})

test('las métricas también reportan la espera de lo pendiente', () => {
  const items = [
    { estado: 'pendiente', creadoEn: 0, resumen: { total: 100 }, intentos: 2 },
    { estado: 'pendiente', creadoEn: 1000, resumen: { total: 300 }, intentos: 1 },
    { estado: 'enviada', creadoEn: 0, sincronizadaEn: 4000, resumen: { total: 500 } },
  ]
  const metricas = metricasDeCola(items, { ahora: 5000 })
  assert.equal(metricas.pendientes, 2)
  assert.equal(metricas.enColaPyg, 400)
  assert.equal(metricas.vendidoPyg, 900)
  assert.equal(metricas.intentos, 3)
  assert.equal(metricas.esperaPromedioMs, 4500)
  assert.equal(metricas.tasaExito, 100)
})
