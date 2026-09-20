import assert from 'node:assert/strict'

// Campañas de recompra (#82): segmentos calculados por SQL, tope de 200,
// permiso ADMIN/GERENTE, consentimiento de WhatsApp respetado y marca de
// contacto `marketingContactedAt` persistida en la ficha.
// Uso: node customer-segments.mjs <baseUrl> <adminToken> <sellerToken>

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: customer-segments.mjs <baseUrl> <adminToken> <sellerToken>')

async function request(path, method = 'GET', body, token = adminToken, tenant = 'tenant-a-it') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(tenant ? { 'x-tenant-id': tenant } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const marca = Date.now()
let contador = 0
// Producto propio para no depender del stock que otros tests del arnés ya
// consumieron sobre los productos sembrados.
let result = await request('/api/products', 'POST', { sku: `SEG-${marca}`, name: `Producto segmentos ${marca}`, category: 'Test', pricePyg: 100000, stock: 5 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const producto = result.payload.id
const cliente = async (datos) => {
  contador += 1
  // Teléfono único por ficha: el endpoint deduplica por teléfono y reusaría la
  // ficha anterior si todos compartieran el mismo número.
  const phone = `59596${String(marca).slice(-5)}${String(contador).padStart(2, '0')}`
  const result = await request('/api/customers', 'POST', { name: `Segmento ${datos.sufijo} ${marca}`, phone, countryCode: '+595', ...datos.extra })
  assert.equal(result.response.status, 201, JSON.stringify(result.payload))
  return result.payload
}

const inactivoOk = await cliente({ sufijo: 'Inactivo Ok', extra: { acceptsWhatsappMarketing: true } })
const inactivoSinConsentimiento = await cliente({ sufijo: 'Inactivo Sin Consentimiento' })
const mayorista = await cliente({ sufijo: 'Mayorista', extra: { pricingTier: 'WHOLESALE', acceptsWhatsappMarketing: true } })
const deudor = await cliente({ sufijo: 'Deudor Al Dia', extra: { acceptsWhatsappMarketing: true, creditLimitPyg: 500000, creditDays: 30 } })
const vencido = await cliente({ sufijo: 'Deudor Vencido', extra: { creditLimitPyg: 500000, creditDays: 30 } })

// Deudor al día: pedido PENDING con pago parcial confirmado y sin vencimiento.
result = await request('/api/orders', 'POST', {
  orderNumber: `SEG-ALDO-${marca}`,
  customerId: deudor.id,
  items: [{ productId: producto, description: 'Producto segmentos', quantity: 1, unitPricePyg: 100000 }],
  payment: { method: 'CASH', amountPyg: 40000 },
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
// Deudor vencido: pedido PENDING con vencimiento en el pasado.
result = await request('/api/orders', 'POST', {
  orderNumber: `SEG-VENC-${marca}`,
  customerId: vencido.id,
  items: [{ productId: producto, description: 'Producto segmentos vencido', quantity: 1, unitPricePyg: 100000 }],
  dueAt: new Date(Date.now() - 10 * 86400000).toISOString(),
})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))

// Permisos: el vendedor no ve segmentos y el segmento debe existir.
result = await request('/api/customers/segments', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 403, 'El vendedor no debe poder listar segmentos.')
result = await request('/api/customers/segments?segment=inexistente')
assert.equal(result.response.status, 400, 'Un segmento inexistente debe rechazarse.')

const segmento = async (nombre) => {
  const data = await request(`/api/customers/segments?segment=${nombre}`)
  assert.equal(data.response.status, 200, JSON.stringify(data.payload))
  const { segment, total, customers } = data.payload
  assert.equal(segment, nombre)
  assert.ok(Number.isInteger(total) && total >= 1, `El segmento ${nombre} debe informar un total.`)
  assert.ok(Array.isArray(customers) && customers.length <= 200, `El segmento ${nombre} debe venir con tope 200.`)
  for (const row of customers) {
    assert.ok(row.id && typeof row.name === 'string' && row.phone !== undefined && row.countryCode, `Ficha incompleta en ${nombre}.`)
    assert.ok('lastOrderAt' in row && 'totalSpentPyg' in row, `Faltan stats en ${nombre}.`)
  }
  return data.payload
}

// Inactivos 6 meses: sin pedidos o con última compra vieja. No incluye a quien
// compró hace instantes (el deudor al día).
const inactivos = await segmento('inactivos6m')
const idsInactivos = inactivos.customers.map((row) => row.id)
assert.ok(idsInactivos.includes(inactivoOk.id), 'El cliente sin pedidos debe estar en inactivos6m.')
assert.ok(idsInactivos.includes(inactivoSinConsentimiento.id), 'El cliente sin pedidos debe estar en inactivos6m aunque no acepte WhatsApp.')
assert.ok(!idsInactivos.includes(deudor.id), 'Un cliente con compra reciente no debe estar en inactivos6m.')

const dormidos = await segmento('mayoristasDormidos')
assert.ok(dormidos.customers.some((row) => row.id === mayorista.id), 'El mayorista sin compra en 3 meses debe estar dormido.')
assert.ok(!dormidos.customers.some((row) => row.id === inactivoOk.id), 'Un cliente final no entra en mayoristasDormidos.')

const deudores = await segmento('deudoresAlDia')
const deuda = deudores.customers.find((row) => row.id === deudor.id)
assert.ok(deuda, 'El cliente con saldo y sin vencidos debe estar en deudoresAlDia.')
assert.equal(Number(deuda.pendingPyg), 60000, 'El saldo pendiente debe ser total menos pagos confirmados.')
assert.ok(!deudores.customers.some((row) => row.id === vencido.id), 'Un cliente con deuda vencida no entra en deudoresAlDia.')

// Marca de contacto: solo se marca a quien aceptó WhatsApp y queda guardada.
result = await request('/api/customers/segments', 'POST', { customerIds: [inactivoSinConsentimiento.id, inactivoOk.id], segment: 'inactivos6m' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload, { ok: true, updated: 1, skipped: 1 })
result = await request('/api/customers/segments', 'POST', { customerIds: [] })
assert.equal(result.response.status, 400, 'Sin destinatarios debe rechazarse.')

const despues = await segmento('inactivos6m')
const marcado = despues.customers.find((row) => row.id === inactivoOk.id)
const sinMarcar = despues.customers.find((row) => row.id === inactivoSinConsentimiento.id)
assert.ok(marcado?.marketingContactedAt, 'La ficha contactada debe guardar marketingContactedAt.')
assert.equal(sinMarcar?.marketingContactedAt, null, 'Sin consentimiento de WhatsApp no se marca el contacto.')

console.log('customer-segments: segmentos, permisos, consentimiento y marca de contacto OK.')
