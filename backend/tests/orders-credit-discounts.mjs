import assert from 'node:assert/strict'

const [baseUrl, adminToken] = process.argv.slice(2)
if (!baseUrl || !adminToken) throw new Error('Uso: orders-credit-discounts.mjs <baseUrl> <adminToken>')

async function request(path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}
const publicGet = async (path) => {
  const response = await fetch(`${baseUrl}${path}`)
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

// Cliente mayorista con crédito.
let result = await request('/api/customers', 'POST', { name: `Crédito Test ${Date.now()}`, phone: `59599${String(Date.now()).slice(-7)}`, pricingTier: 'WHOLESALE', creditLimitPyg: 1000000, creditDays: 30 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const customer = result.payload
assert.equal(customer.pricingTier, 'WHOLESALE')

// Producto con precio mayorista.
const sku = `CRED-SKU-${Date.now()}`
result = await request('/api/products', 'POST', { sku, name: 'Equipo crédito y descuentos', pricePyg: 950000, wholesalePricePyg: 800000, stock: 10, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const product = result.payload
assert.equal(product.wholesalePricePyg, 800000)

// Descuento fijo por línea.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000, discountPyg: 100000 }], payments: [{ method: 'CASH', amountPyg: 700000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.items[0].discountPyg, 100000)
assert.equal(result.payload.totalPyg, 700000)
assert.equal(result.payload.status, 'COMPLETED')

// Descuento porcentual por línea.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000, discountPct: 10 }], payments: [{ method: 'CASH', amountPyg: 720000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.items[0].discountPyg, 80000)
assert.equal(result.payload.totalPyg, 720000)

// Fijo + porcentual juntos se rechaza.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000, discountPyg: 10000, discountPct: 5 }], payments: [] })
assert.equal(result.response.status, 400)

// Venta a crédito con plazo.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 15 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const creditOrder = result.payload
assert.equal(creditOrder.status, 'PENDING')
assert.ok(creditOrder.dueAt, 'La venta a crédito debe tener vencimiento.')
assert.equal(creditOrder.creditDays, 15)

// Superar el límite de crédito se rechaza.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 10 })
assert.equal(result.response.status, 409, 'Debe rechazar por superar el límite de crédito.')

// Cliente sin límite no puede vender a crédito.
result = await request('/api/customers', 'POST', { name: `Sin Crédito ${Date.now()}`, phone: `59598${String(Date.now()).slice(-7)}` })
assert.equal(result.response.status, 201)
result = await request('/api/orders', 'POST', { customerId: result.payload.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 10 })
assert.equal(result.response.status, 400, 'Debe rechazar crédito sin límite configurado.')

// Control de créditos: aparece el cliente con pendiente y mora.
result = await request('/api/credits')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const creditRow = result.payload.credits.find(row => row.customerId === customer.id)
assert.ok(creditRow, 'El cliente con deuda debe aparecer en el control de créditos.')
assert.ok(creditRow.outstandingPyg > 0)

// Cuenta de tarjeta con settlementDays: el pago trae fecha de acreditación.
result = await request('/api/payment-accounts', 'POST', { name: `Tarjeta ${Date.now()}`, kind: 'CARD', currency: 'PYG', settlementDays: 2 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const cardAccount = result.payload
result = await request('/api/payments', 'POST', { orderId: creditOrder.id, accountId: cardAccount.id, originalAmount: 800000, exchangeRatePyg: 1, currency: 'PYG', method: 'CARD' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.ok(result.payload.settlesAt, 'El pago con tarjeta debe traer fecha de acreditación.')
const settleDays = Math.round((new Date(result.payload.settlesAt).getTime() - Date.now()) / 86400000)
assert.ok(settleDays === 1 || settleDays === 2, `Acreditación esperada en 1-2 días, recibido ${settleDays}.`)

// Garantía con token público, cobertura y exclusiones.
const warranty = { customerName: customer.name, serial: `WARR-${Date.now()}`, description: 'Equipo en garantía', branchId: 'branch-a-it', warrantyDays: 90, coverage: 'Defectos de fábrica\nPantalla', exclusions: 'Daños por agua\nReparaciones de terceros', orderItemId: creditOrder.items[0].id }
result = await request('/api/warranties', 'POST', warranty)
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const warrantyRow = Array.isArray(result.payload) ? result.payload[0] : result.payload
assert.ok(warrantyRow.publicToken, 'La garantía debe tener token público.')
const publicWarranty = await publicGet(`/api/public/warranty/${warrantyRow.publicToken}`)
assert.equal(publicWarranty.response.status, 200)
assert.equal(publicWarranty.payload.serial, warranty.serial)
assert.ok(publicWarranty.payload.daysRemaining >= 89 && publicWarranty.payload.daysRemaining <= 91, `Días restantes esperados ~90, recibido ${publicWarranty.payload.daysRemaining}.`)
assert.ok(publicWarranty.payload.coverage.includes('Defectos de fábrica'))
assert.ok(publicWarranty.payload.exclusions.includes('Daños por agua'))
// El tracking público del pedido lista la garantía.
const publicOrder = await publicGet(`/api/orders/public/${creditOrder.publicToken}`)
assert.equal(publicOrder.response.status, 200)
assert.ok(publicOrder.payload.warranties.some(item => item.token === warrantyRow.publicToken), 'El pedido público debe listar su garantía.')

// Etiquetas del pedido.
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { tags: ['VIP', 'Entrega hoy'] })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.tags, ['VIP', 'Entrega hoy'])
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { tags: ['x'.repeat(41)] })
assert.equal(result.response.status, 400, 'Una etiqueta de más de 40 caracteres debe rechazarse.')

// Archivado y desarchivado.
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { action: 'archive' })
assert.equal(result.response.status, 200)
assert.ok(result.payload.archivedAt, 'Archivar debe registrar fecha.')
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { action: 'unarchive' })
assert.equal(result.response.status, 200)
assert.equal(result.payload.archivedAt, null)

// Comentario con foto y cronología.
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const commentForm = new FormData()
commentForm.append('body', 'Verificado con foto de recepción.')
commentForm.append('file', new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' }), 'evidencia.png')
const commentResponse = await fetch(`${baseUrl}/api/orders/${encodeURIComponent(creditOrder.id)}/comments`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it' }, body: commentForm })
const commentPayload = await commentResponse.json().catch(() => null)
assert.equal(commentResponse.status, 201, JSON.stringify(commentPayload))
assert.ok(commentPayload.photos?.length === 1, 'El comentario debe guardar la foto adjunta.')
const commentId = commentPayload.id
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.events.some(event => event.type === 'comment' && event.body.includes('Verificado')), 'La cronología debe incluir el comentario.')
assert.ok(result.payload.events.some(event => event.type === 'payment'), 'La cronología debe incluir el pago.')
assert.ok(result.payload.events.some(event => event.type === 'audit' && event.action === 'ORDER_ARCHIVED'), 'La cronología debe incluir el archivado auditado.')
const photoResponse = await fetch(`${baseUrl}/api/orders/${encodeURIComponent(creditOrder.id)}/comments/${encodeURIComponent(commentId)}/photos/${encodeURIComponent(commentPayload.photos[0].id)}`, { headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it' } })
assert.equal(photoResponse.status, 200)
assert.equal(photoResponse.headers.get('content-type'), 'image/png')

// Garantía automática al vender un equipo serializado.
const warrantySerial = `AUTO-WARR-${Date.now()}`
result = await request('/api/products', 'POST', { sku: `AUTO-WARR-SKU-${Date.now()}`, name: 'Equipo con garantía automática', pricePyg: 500000, stock: 1, branchId: 'branch-a-it', imei: warrantySerial })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const serializedProduct = result.payload
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: serializedProduct.id, quantity: 1, unitPricePyg: 500000, inventoryUnitSerials: [warrantySerial] }], payments: [{ method: 'CASH', amountPyg: 500000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const warrantySerialKey = warrantySerial.replace(/[^A-Z0-9]/gi, '').toUpperCase()
result = await request(`/api/warranties?kind=COVERAGE&q=${encodeURIComponent(warrantySerialKey)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const autoWarranty = (Array.isArray(result.payload) ? result.payload : []).find(row => row.serial === warrantySerialKey)
assert.ok(autoWarranty, 'La venta debe crear la garantía automáticamente.')
assert.ok(autoWarranty.publicToken, 'La garantía automática debe tener token público.')
const publicAuto = await publicGet(`/api/public/warranty/${autoWarranty.publicToken}`)
assert.equal(publicAuto.response.status, 200)
assert.ok(publicAuto.payload.daysRemaining > 0, 'La garantía automática debe tener días vigentes.')

// Avisos WhatsApp por estado: mensaje con plantilla y marca de avisado.
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { fulfillmentStatus: 'READY_FOR_PICKUP' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}/whatsapp-message`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.message.includes(creditOrder.orderNumber), 'El mensaje debe citar el pedido.')
assert.ok(result.payload.whatsappUrl.startsWith('https://wa.me/'), 'Debe generar el enlace de WhatsApp.')
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}`, 'PATCH', { action: 'markNotified' })
assert.equal(result.response.status, 200)
assert.ok(result.payload.notifiedAt, 'El pedido debe registrar la fecha de aviso.')

// Pipeline de cotizaciones: crear, estados, vencimiento y conversión a pedido.
result = await request('/api/quotes', 'POST', { customerName: customer.name, customerId: customer.id, validUntil: new Date(Date.now() + 3 * 86400000).toISOString(), items: [{ productId: product.id, description: 'Equipo cotizado', quantity: 2, unitPricePyg: 800000 }], discountPyg: 50000 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const quote = result.payload
assert.equal(quote.totalPyg, 1550000)
assert.equal(quote.status, 'DRAFT')
result = await request('/api/quotes', 'PATCH', { id: quote.id, status: 'SENT' })
assert.equal(result.response.status, 200)
result = await request('/api/quotes', 'PATCH', { id: quote.id, status: 'ACCEPTED' })
assert.equal(result.response.status, 200)
result = await request(`/api/quotes/${encodeURIComponent(quote.id)}/convert`, 'POST', {})
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const convertedOrder = result.payload
assert.ok(convertedOrder.orderNumber, 'La conversión debe crear un pedido.')
result = await request('/api/quotes')
assert.equal(result.response.status, 200)
const convertedQuote = result.payload.find(row => row.id === quote.id)
assert.equal(convertedQuote.status, 'CONVERTED')
assert.equal(convertedQuote.orderId, convertedOrder.id)
result = await request(`/api/quotes/${encodeURIComponent(quote.id)}/convert`, 'POST', {})
assert.equal(result.response.status, 409, 'No se convierte dos veces la misma cotización.')
result = await request('/api/quotes', 'POST', { customerName: 'Cliente vencido', validUntil: new Date(Date.now() - 86400000).toISOString(), items: [{ description: 'Ítem', quantity: 1, unitPricePyg: 1000 }] })
assert.equal(result.response.status, 201)
const expiredId = result.payload.id
result = await request('/api/quotes')
assert.equal(result.response.status, 200)
assert.equal(result.payload.find(row => row.id === expiredId).status, 'EXPIRED', 'La cotización vencida debe marcarse sola.')

// Combos: paquete con precio fijo y componentes únicos.
result = await request('/api/combos', 'POST', { name: 'Combo prueba', pricePyg: 900000, items: [{ productId: product.id, quantity: 1 }, { productId: serializedProduct.id, quantity: 1 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const combo = result.payload
assert.equal(combo.pricePyg, 900000)
result = await request('/api/combos')
assert.equal(result.response.status, 200)
assert.ok(result.payload.some(row => row.id === combo.id), 'El combo debe listarse.')
result = await request('/api/combos', 'POST', { name: 'Combo inválido', pricePyg: 1000, items: [{ productId: product.id, quantity: 1 }] })
assert.equal(result.response.status, 400, 'Un combo necesita al menos 2 componentes.')
result = await request('/api/combos', 'PATCH', { id: combo.id, isActive: false })
assert.equal(result.response.status, 200)
assert.equal(result.payload.isActive, false)

console.log('orders-credit-discounts: OK (descuentos fijo/%, mayorista, crédito con límite y mora, acreditación de tarjeta, garantía pública y automática, etiquetas, archivado, comentarios con foto, aviso WhatsApp, pipeline de cotizaciones y combos).')
