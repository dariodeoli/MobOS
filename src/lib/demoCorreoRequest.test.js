import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoCorreoDemo, correoDemoEnviable, demoCorreoDePedido, enviarCorreoDemo, itemsDeResumenCorreoDemo, itemsParaCorreoDemo, payloadCorreoDemo, tipoCorreoDemoDeEntrega } from './demoCorreoRequest.js'

const items = [{ quantity: 1, description: 'iPhone 15', unitPricePyg: 4850000 }, { quantity: 2, description: 'Funda', unitPricePyg: 90000 }]
const pedido = { kind: 'receipt', numero: 'AUR-0007', email: 'ana@gmail.com', cliente: 'Ana', items, descuento: 30000 }

test('el payload recalcula el total y solo lleva datos estructurados', () => {
  const payload = payloadCorreoDemo(pedido)
  assert.deepEqual(Object.keys(payload).sort(), ['customerName', 'discountPyg', 'email', 'items', 'kind', 'number', 'totalPyg'])
  assert.equal(payload.totalPyg, 5000000)
  assert.equal(payloadCorreoDemo({ ...pedido, descuento: 0 }).discountPyg, undefined)
  assert.equal(payloadCorreoDemo({ ...pedido, descuento: 99999999999 }).totalPyg, 0)
  assert.equal(payloadCorreoDemo({ ...pedido, kind: 'quote', validUntil: '2026-10-30T00:00:00Z' }).validUntil, '2026-10-30')
  assert.equal(payloadCorreoDemo(pedido).validUntil, undefined)
})

test('los ítems se acotan y el envío va como renglón', () => {
  const muchos = Array.from({ length: 15 }, (_, i) => ({ quantity: 200, description: `x${i}`, unitPricePyg: 1.4 }))
  const lista = itemsParaCorreoDemo(muchos, { envio: 25000 })
  assert.equal(lista.length, 10)
  assert.equal(lista.at(-1).description, 'Envío')
  assert.equal(lista[0].quantity, 99)
  assert.deepEqual(itemsDeResumenCorreoDemo(['1× iPhone 15 128GB Azul'], 4880000), [{ quantity: 1, description: 'iPhone 15 128GB Azul', unitPricePyg: 4880000 }])
})

test('el estado de entrega elige el tipo de correo', () => {
  assert.equal(tipoCorreoDemoDeEntrega('READY_FOR_PICKUP'), 'ready_for_pickup')
  assert.equal(tipoCorreoDemoDeEntrega('IN_TRANSIT'), 'in_transit')
  assert.equal(tipoCorreoDemoDeEntrega('DELIVERED'), 'delivered')
  assert.equal(tipoCorreoDemoDeEntrega('READY_TO_SHIP'), '')
  assert.equal(demoCorreoDePedido({ fulfillmentStatus: 'READY_TO_SHIP', items }), null)
  const datos = demoCorreoDePedido({ fulfillmentStatus: 'IN_TRANSIT', orderNumber: 'AUR-0007', customer: { name: 'Ana' }, items, totalPyg: 5000000 })
  assert.equal(datos.kind, 'in_transit')
  assert.equal(payloadCorreoDemo({ ...datos, email: 'a@gmail.com' }).totalPyg, 5000000)
  const conEnvio = demoCorreoDePedido({ fulfillmentStatus: 'DELIVERED', orderNumber: 'AUR-1', items, totalPyg: 5060000 })
  assert.equal(payloadCorreoDemo({ ...conEnvio, email: 'a@gmail.com' }).totalPyg, 5060000)
})

const respuesta = (status, body, headers = {}) => async () => new Response(JSON.stringify(body), { status, headers })

test('envía sin credenciales a la ruta pública y devuelve el destinatario', async () => {
  let llamada
  const resultado = await enviarCorreoDemo(payloadCorreoDemo(pedido), { apiUrl: 'https://api.example.test/', fetchImpl: async (url, init) => { llamada = { url, init }; return new Response(JSON.stringify({ sent: true })) } })
  assert.deepEqual(resultado, { estado: 'enviado', para: 'ana@gmail.com' })
  assert.equal(llamada.url, 'https://api.example.test/api/public/demo-email')
  assert.equal(llamada.init.credentials, 'omit')
  assert.equal(llamada.init.method, 'POST')
  assert.equal(avisoCorreoDemo(resultado, 'ana@gmail.com').titulo, 'Te enviamos el correo a ana@gmail.com')
})

test('apagado, sin API o sin red: la demo conserva la vista previa', async () => {
  const apagado = await enviarCorreoDemo({ email: 'a@gmail.com' }, { apiUrl: 'https://x.test', fetchImpl: respuesta(503, { message: 'x', details: { code: 'demo_email_disabled' } }) })
  assert.equal(apagado.estado, 'desactivado')
  assert.equal((await enviarCorreoDemo({}, { apiUrl: '' })).estado, 'desactivado')
  assert.equal((await enviarCorreoDemo({ email: 'a@gmail.com' }, { apiUrl: 'https://x.test', fetchImpl: async () => { throw new Error('offline') } })).estado, 'desactivado')
  assert.equal(avisoCorreoDemo(apagado, 'a@b.com'), null)
})

test('cuota agotada o dato inválido: se muestra el motivo', async () => {
  const cuota = await enviarCorreoDemo({ email: 'a@gmail.com' }, { apiUrl: 'https://x.test', fetchImpl: respuesta(429, { message: 'Alcanzamos el límite diario de correos de la demo.', details: { code: 'demo_rate_limited_global' } }, { 'retry-after': '7200' }) })
  assert.equal(cuota.estado, 'rechazado')
  assert.match(cuota.motivo, /límite diario/)
  assert.match(cuota.motivo, /2 h/)
  assert.equal(avisoCorreoDemo(cuota, 'a@b.com').tipo, 'error')
  const invalido = await enviarCorreoDemo({ email: 'a@gmail.com' }, { apiUrl: 'https://x.test', fetchImpl: respuesta(400, { message: 'Ese correo es temporal o de ejemplo.', details: { code: 'disposable_email' } }) })
  assert.equal(invalido.codigo, 'disposable_email')
  assert.match(invalido.motivo, /temporal/)
})

test('las casillas ficticias de la demo no hacen ninguna llamada', async () => {
  for (const correo of ['lucia@ejemplo.com', 'x@example.org', 'x@sub.ejemplo.net', 'x@tienda.test', 'sin-arroba', '']) assert.equal(correoDemoEnviable(correo), false, correo)
  assert.equal(correoDemoEnviable('ana@gmail.com'), true)
  let llamadas = 0
  const resultado = await enviarCorreoDemo({ email: 'lucia@ejemplo.com' }, { apiUrl: 'https://x.test', fetchImpl: async () => { llamadas += 1; return new Response('{}') } })
  assert.equal(resultado.estado, 'desactivado')
  assert.equal(llamadas, 0)
})
