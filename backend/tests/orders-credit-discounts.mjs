import assert from 'node:assert/strict'

const [baseUrl, adminToken, sellerToken] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken) throw new Error('Uso: orders-credit-discounts.mjs <baseUrl> <adminToken> <sellerToken>')

async function request(path, method = 'GET', body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

// Igual que request() pero con la sesión de vendedor (para autorizaciones).
async function sellerRequest(path, method = 'GET', body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${sellerToken}`, 'x-tenant-id': 'tenant-a-it', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
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

// Numeración secuencial: dos pedidos nuevos seguidos usan MOB-##### y crecen.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 800000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const primeraVenta = result.payload.orderNumber
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 800000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const segundaVenta = result.payload.orderNumber
assert.match(primeraVenta, /^MOB-#\d{4,}$/, `La numeración interna debe ser MOB-#####, recibido ${primeraVenta}.`)
assert.match(segundaVenta, /^MOB-#\d{4,}$/, `La numeración interna debe ser MOB-#####, recibido ${segundaVenta}.`)
const secuenciaVenta = (numero) => Number(String(numero).replace(/^MOB-#/, ''))
assert.ok(secuenciaVenta(segundaVenta) > secuenciaVenta(primeraVenta), `La numeración debe ser creciente: ${primeraVenta} → ${segundaVenta}.`)

// Perfil y cronología del cliente: quién lo creó y eventos unificados.
result = await request(`/api/customers/${encodeURIComponent(customer.id)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.customer?.createdBy?.name, 'El perfil debe devolver quién creó el cliente.')
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/timeline`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const tiposCronologia = new Set((result.payload.events || []).map(event => event.type))
assert.ok(tiposCronologia.has('customer') && tiposCronologia.has('order') && tiposCronologia.has('payment'), 'La cronología debe incluir alta, pedido y pago confirmado.')
assert.ok((result.payload.events || []).every(event => event.id && event.action && event.createdAt), 'Cada evento necesita id, acción y fecha.')

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

// Búsqueda y filtros del listado resueltos en el servidor: cubren todos los
// pedidos del alcance, no solo la página cargada.
const nombreSinAcentos = customer.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
result = await request(`/api/orders?filtro=todos&q=${encodeURIComponent(nombreSinAcentos)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === creditOrder.id), 'q por nombre de cliente (sin acentos) debe encontrar sus pedidos.')
console.log('orders-credit-discounts · check q por nombre de cliente: OK')
result = await request('/api/orders?filtro=credito')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === creditOrder.id), 'filtro=credito debe devolver el pedido a crédito.')
console.log('orders-credit-discounts · check filtro=credito: OK')
result = await request('/api/orders?filtro=pendientes')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(!result.payload.some(row => row.id === creditOrder.id), 'filtro=pendientes no debe devolver un pedido a crédito.')
console.log('orders-credit-discounts · check filtro=pendientes excluye crédito: OK')
result = await request('/api/orders?filtro=nopagados')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === creditOrder.id), 'filtro=nopagados debe incluir el pedido a crédito.')
console.log('orders-credit-discounts · check filtro=nopagados incluye crédito: OK')

// Superar el límite de crédito se rechaza.
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 10 })
assert.equal(result.response.status, 409, 'Debe rechazar por superar el límite de crédito.')

// Cliente sin límite no puede vender a crédito.
result = await request('/api/customers', 'POST', { name: `Sin Crédito ${Date.now()}`, phone: `59598${String(Date.now()).slice(-7)}` })
assert.equal(result.response.status, 201)
const sinCredito = result.payload
result = await request('/api/orders', 'POST', { customerId: sinCredito.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 10 })
assert.equal(result.response.status, 400, 'Debe rechazar crédito sin límite configurado.')

// Autorizaciones comerciales: el vendedor pide plazo, gerencia autoriza un
// máximo menor al pedido y el cliente queda con lo autorizado, auditado.
result = await sellerRequest('/api/authorizations', 'POST', { customerId: customer.id, kind: 'CREDIT_DAYS', requestedValue: { creditDays: 10 }, note: 'Necesita 10 días para compras mayoristas.' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authDays = result.payload
assert.equal(authDays.status, 'PENDING')
assert.equal(authDays.requestedById, 'user-a-it')
assert.deepEqual(authDays.requestedValue, { creditDays: 10 })
assert.equal(authDays.requestedBy?.name, 'Seller A')

// No se permiten dos pendientes del mismo tipo para el mismo cliente.
result = await sellerRequest('/api/authorizations', 'POST', { customerId: customer.id, kind: 'CREDIT_DAYS', requestedValue: { creditDays: 15 } })
assert.equal(result.response.status, 409, 'Debe rechazar solicitudes duplicadas pendientes.')

// El vendedor ve su solicitud, pero no puede resolverla.
result = await sellerRequest(`/api/authorizations?customerId=${encodeURIComponent(customer.id)}&status=PENDING`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(Array.isArray(result.payload) && result.payload.some(row => row.id === authDays.id), 'El vendedor debe ver su solicitud pendiente.')
result = await sellerRequest('/api/authorizations', 'PATCH', { id: authDays.id, action: 'approve', resolvedValue: { creditDays: 10 } })
assert.equal(result.response.status, 403, 'Un vendedor no puede resolver su propia solicitud.')

// Gerencia aprueba con 7 días: el máximo autorizado puede ser menor al pedido.
result = await request('/api/authorizations', 'PATCH', { id: authDays.id, action: 'approve', resolvedValue: { creditDays: 7 }, resolvedNote: 'Máximo autorizado: 7 días.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'APPROVED')
assert.equal(result.payload.resolvedValue.creditDays, 7)
assert.equal(result.payload.resolvedBy?.id, 'user-admin-it')

result = await request(`/api/customers/${encodeURIComponent(customer.id)}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.customer.creditDays, 7, 'El cliente debe quedar con los días autorizados, no con los pedidos.')

// La cronología del cliente muestra la solicitud y la aprobación.
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/timeline`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const accionesAutorizacion = new Set((result.payload.events || []).map(event => event.action))
assert.ok(accionesAutorizacion.has('CUSTOMER_AUTHORIZATION_REQUESTED'), 'La cronología debe incluir la solicitud.')
assert.ok(accionesAutorizacion.has('CUSTOMER_AUTHORIZATION_APPROVED'), 'La cronología debe incluir la aprobación.')

// Ni administración puede resolver una solicitud propia.
result = await request('/api/authorizations', 'POST', { customerId: sinCredito.id, kind: 'CREDIT', requestedValue: { creditLimitPyg: 500000, creditDays: 14 } })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authPropia = result.payload
result = await request('/api/authorizations', 'PATCH', { id: authPropia.id, action: 'approve', resolvedValue: { creditLimitPyg: 500000, creditDays: 14 } })
assert.equal(result.response.status, 403, 'Nadie puede resolver su propia solicitud.')
result = await request(`/api/customers/${encodeURIComponent(sinCredito.id)}`)
assert.equal(result.payload.customer.creditLimitPyg, null, 'La solicitud propia no debe aplicarse.')

// Mayorista: la aprobación cambia el precio del cliente.
result = await sellerRequest('/api/authorizations', 'POST', { customerId: sinCredito.id, kind: 'WHOLESALE' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request('/api/authorizations', 'PATCH', { id: result.payload.id, action: 'approve' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/customers/${encodeURIComponent(sinCredito.id)}`)
assert.equal(result.payload.customer.pricingTier, 'WHOLESALE', 'El cliente debe pasar a mayorista.')

// Identidades de facturación: alta, uso como actual, duplicado y borrado.
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`, 'POST', { name: 'Facturación Empresa S.A.', document: '80012345-6' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const billingIdentity = result.payload
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`, 'PATCH', { id: billingIdentity.id, useAsCurrent: true })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/customers/${encodeURIComponent(customer.id)}`)
assert.equal(result.payload.customer.billingName, 'Facturación Empresa S.A.')
assert.equal(result.payload.customer.billingDocument, '80012345-6')
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.document === '80012345-6'), 'La identidad actual debe listarse.')
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`, 'POST', { name: 'Duplicada', document: '80012345-6' })
assert.equal(result.response.status, 409, 'El RUC debe ser único por cliente.')
// La identidad vigente se autocrea al listar, por eso se borra una histórica.
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`, 'POST', { name: 'Identidad histórica', document: '77777777-7' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const billingHistory = result.payload
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities?id=${encodeURIComponent(billingHistory.id)}`, 'DELETE')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`)
assert.ok(!result.payload.some(row => row.document === '77777777-7'), 'La identidad borrada no debe listarse.')
assert.ok(result.payload.some(row => row.document === '80012345-6'), 'La facturación vigente se autocrea al listar.')

// La venta con factura a otro titular guarda la identidad en la ficha.
result = await request('/api/orders', 'POST', { customerId: customer.id, billingTo: { name: 'Titular Factura', document: '99999999-1' }, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 800000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await request(`/api/customers/${encodeURIComponent(customer.id)}/billing-identities`)
assert.ok(result.payload.some(row => row.document === '99999999-1'), 'La facturación de la venta debe guardarse como identidad.')

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
const ventaSerializada = result.payload
const warrantySerialKey = warrantySerial.replace(/[^A-Z0-9]/gi, '').toUpperCase()
// La búsqueda cubre los seriales por la tabla espejo: los últimos 4 alcanzan.
result = await request(`/api/orders?filtro=todos&q=${encodeURIComponent(warrantySerialKey.slice(-4))}`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === ventaSerializada.id), 'q con los últimos 4 del IMEI/serial debe encontrar el pedido.')
console.log('orders-credit-discounts · check q por últimos 4 del IMEI/serial: OK')
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

// Plantillas de WhatsApp por categoría: siembra, alta con clave autogenerada,
// predeterminada única por categoría, copia y borrado acotado al tenant.
result = await request('/api/message-templates?category=CUSTOMERS')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const plantillasClientes = result.payload
assert.ok(plantillasClientes.length >= 4, 'La categoría CUSTOMERS debe sembrar sus plantillas base.')
assert.ok(plantillasClientes.every(row => row.category === 'CUSTOMERS'), 'El filtro por categoría no debe mezclar contextos.')
const predeterminadaPrevia = plantillasClientes.find(row => row.key === 'seguimiento') || plantillasClientes[0]
result = await request('/api/message-templates', 'PATCH', { id: predeterminadaPrevia.id, isDefault: true })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/message-templates', 'POST', { name: `Aviso mayorista ${Date.now()}`, body: 'Hola {{cliente}}, {{empresa}} tiene novedades para vos.', category: 'CUSTOMERS' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const plantillaNueva = result.payload
assert.equal(plantillaNueva.isDefault, false)
assert.ok(plantillaNueva.key && plantillaNueva.key.length <= 64, 'La clave autogenerada debe tener hasta 64 caracteres.')
result = await request('/api/message-templates', 'PATCH', { id: plantillaNueva.id, isDefault: true, isActive: false })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/message-templates?category=CUSTOMERS')
assert.equal(result.response.status, 200)
assert.equal(result.payload[0].id, plantillaNueva.id, 'La plantilla predeterminada debe listarse primero.')
assert.equal(result.payload[0].isActive, false)
assert.equal(result.payload.find(row => row.id === predeterminadaPrevia.id).isDefault, false, 'Marcar una nueva predeterminada debe destildar la anterior.')
result = await request('/api/message-templates?category=ORDERS')
assert.equal(result.response.status, 200)
assert.ok(result.payload.some(row => row.key === 'ready_for_pickup') && result.payload.every(row => row.category === 'ORDERS'), 'ORDERS conserva sus plantillas base.')
// Envío con plantilla elegida: el POST arma el mensaje y marca el aviso.
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}/whatsapp-message`, 'POST', { templateKey: 'ready_for_pickup' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.templateKey, 'ready_for_pickup')
assert.ok(result.payload.whatsappUrl.startsWith('https://wa.me/'), 'El POST debe devolver el enlace de WhatsApp.')
assert.ok(result.payload.notifiedAt, 'El POST debe marcar el pedido como avisado.')
result = await request(`/api/orders/${encodeURIComponent(creditOrder.id)}/whatsapp-message`, 'POST', { templateKey: 'no_existe' })
assert.equal(result.response.status, 404, 'Una plantilla inexistente no puede enviarse.')
result = await request('/api/message-templates', 'POST', { duplicateOf: plantillaNueva.id })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.ok(result.payload.name.endsWith('(copia)') && result.payload.isDefault === false, 'La copia no hereda la marca de predeterminada.')
result = await request(`/api/message-templates?id=${encodeURIComponent(plantillaNueva.id)}`, 'DELETE')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request(`/api/message-templates?id=${encodeURIComponent(plantillaNueva.id)}`, 'DELETE')
assert.equal(result.response.status, 404, 'Borrar dos veces la misma plantilla debe dar 404.')

// Paginación por cursor (la que consume "Cargar más" en la UI): la primera
// página respeta el límite y la siguiente arranca después del último id.
const pagina1 = await request('/api/orders?limit=1')
assert.equal(pagina1.response.status, 200)
assert.equal(pagina1.payload.length, 1, 'limit=1 debe devolver una sola fila.')
const pagina2 = await request(`/api/orders?limit=1&cursor=${pagina1.payload[0].id}`)
assert.equal(pagina2.response.status, 200)
assert.ok(pagina2.payload.length <= 1, 'La página siguiente respeta el límite.')
assert.ok(!pagina2.payload.some(row => row.id === pagina1.payload[0].id), 'La página siguiente no repite el cursor.')

// Garantías: el listado incluye el teléfono del cliente para avisos.
const garantias = await request('/api/warranties?kind=COVERAGE')
assert.equal(garantias.response.status, 200)
const conTelefono = garantias.payload.find((row) => row.serial === warrantySerialKey)
assert.ok(conTelefono, 'La garantía automática debe aparecer en el listado de servicio.')
assert.ok(conTelefono.customerPhone, 'La garantía debe traer el teléfono del cliente.')

console.log('orders-credit-discounts: OK (numeración secuencial MOB-#####, descuentos fijo/%, mayorista, crédito con límite y mora, acreditación de tarjeta, garantía pública y automática, etiquetas, archivado, comentarios con foto, aviso WhatsApp, plantillas por categoría, pipeline de cotizaciones y combos).')
