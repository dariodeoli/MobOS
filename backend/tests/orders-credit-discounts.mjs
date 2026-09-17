import assert from 'node:assert/strict'
import { codigoPedido } from '../../src/utils/pedido.js'

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

// Descuento fuera de política: sin autorización el vendedor no puede descontar.
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 750000 }], discountPyg: 50000 })
assert.equal(result.response.status, 403, 'Un vendedor no puede aplicar descuentos sin autorización.')

// El vendedor pide autorización por el monto; gerencia la ve en el panel.
result = await sellerRequest('/api/authorizations', 'POST', { customerId: customer.id, kind: 'DISCOUNT', requestedValue: { discountPyg: 50000 }, note: 'Cliente frecuente.' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authDiscount = result.payload
assert.equal(authDiscount.status, 'PENDING')
assert.equal(authDiscount.requestedById, 'user-a-it')
assert.deepEqual(authDiscount.requestedValue, { discountPyg: 50000 })
result = await request('/api/authorizations?kind=DISCOUNT&status=PENDING')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === authDiscount.id), 'Gerencia debe ver la solicitud de descuento.')

// Solo una solicitud de descuento pendiente por vendedor.
result = await sellerRequest('/api/authorizations', 'POST', { kind: 'DISCOUNT', requestedValue: { discountPyg: 20000 } })
assert.equal(result.response.status, 409, 'No puede haber dos solicitudes de descuento pendientes del mismo vendedor.')

// Gerencia autoriza un máximo MENOR al pedido (30.000 de 50.000).
result = await request('/api/authorizations', 'PATCH', { id: authDiscount.id, action: 'approve', resolvedValue: { maxDiscountPyg: 30000 }, resolvedNote: 'Máximo autorizado: 30.000.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'APPROVED')
assert.deepEqual(result.payload.resolvedValue, { maxDiscountPyg: 30000 })

// Por encima del máximo autorizado la venta se rechaza con motivo accionable.
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 760000 }], discountPyg: 40000, discountAuthorizationId: authDiscount.id })
assert.equal(result.response.status, 403, 'La autorización no puede cubrir más que el máximo autorizado.')
assert.match(String(result.payload?.message || ''), /no alcanza/i)

// Dentro del máximo: la venta se crea y la autorización queda consumida.
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 775000 }], discountPyg: 25000, discountAuthorizationId: authDiscount.id })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const discountedOrder = result.payload
assert.equal(discountedOrder.discountPyg, 25000)
assert.equal(discountedOrder.totalPyg, 775000)
result = await sellerRequest('/api/authorizations?mine=1&kind=DISCOUNT')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const authUsed = result.payload.find(row => row.id === authDiscount.id)
assert.ok(authUsed?.usedAt, 'La autorización consumida debe quedar marcada con usedAt.')
assert.equal(authUsed.usedByOrderId, discountedOrder.id, 'La autorización debe registrar el pedido que la usó.')
result = await sellerRequest(`/api/orders/${encodeURIComponent(discountedOrder.id)}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.events.some(event => event.action === 'ORDER_DISCOUNT_AUTHORIZED' && event.metadata?.authorizationId === authDiscount.id), 'La cronología del pedido debe auditar el descuento autorizado.')

// La misma autorización no se reutiliza.
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 775000 }], discountPyg: 25000, discountAuthorizationId: authDiscount.id })
assert.equal(result.response.status, 403, 'Una autorización usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// Descuento sin cliente (venta de consumidor final): se pide sin ficha y el
// rechazo exige motivo.
result = await sellerRequest('/api/authorizations', 'POST', { kind: 'DISCOUNT', requestedValue: { discountPyg: 10000 } })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authSinCliente = result.payload
assert.equal(authSinCliente.customer, null)
result = await sellerRequest('/api/authorizations', 'PATCH', { id: authSinCliente.id, action: 'approve', resolvedValue: { maxDiscountPyg: 10000 } })
assert.equal(result.response.status, 403, 'El vendedor no puede resolver su propia solicitud.')
result = await request('/api/authorizations', 'PATCH', { id: authSinCliente.id, action: 'reject' })
assert.equal(result.response.status, 400, 'El rechazo de un descuento necesita motivo.')
result = await request('/api/authorizations', 'PATCH', { id: authSinCliente.id, action: 'reject', resolvedNote: 'Monto fuera de política.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'REJECTED')

// El monto pedido respeta el tope de la política.
result = await sellerRequest('/api/authorizations', 'POST', { kind: 'DISCOUNT', requestedValue: { discountPyg: 150000000 } })
assert.equal(result.response.status, 400, 'El descuento pedido debe respetar el tope de 100.000.000.')

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

// Clientes: paginación por cursor y filtros resueltos en el servidor con el
// mismo contrato que consume "Cargar más" (limit/cursor/filtro/q).
const clientesPagina1 = await request('/api/customers?limit=1')
assert.equal(clientesPagina1.response.status, 200, JSON.stringify(clientesPagina1.payload))
assert.equal(clientesPagina1.payload.length, 1, 'limit=1 debe devolver una sola ficha de cliente.')
const clientesPagina2 = await request(`/api/customers?limit=1&cursor=${clientesPagina1.payload[0].id}`)
assert.equal(clientesPagina2.response.status, 200, JSON.stringify(clientesPagina2.payload))
assert.ok(clientesPagina2.payload.length <= 1, 'La página siguiente de clientes respeta el límite.')
assert.ok(!clientesPagina2.payload.some(row => row.id === clientesPagina1.payload[0].id), 'La página siguiente de clientes no repite el cursor.')
console.log('orders-credit-discounts · check clientes limit/cursor: OK')
result = await request('/api/customers?filtro=mayoristas&limit=500')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.every(row => row.pricingTier === 'WHOLESALE'), 'filtro=mayoristas debe devolver solo mayoristas.')
assert.ok(result.payload.some(row => row.id === customer.id), 'filtro=mayoristas debe incluir al cliente mayorista.')
console.log('orders-credit-discounts · check clientes filtro=mayoristas: OK')

// Deuda real: cliente con saldo pendiente en un pedido PENDING aparece en
// filtro=deuda; con límite en credito, con correo en conemail y nunca en
// sincredito. La búsqueda también cubre ciudad de direcciones y etiquetas.
const marcaDeuda = Date.now()
result = await request('/api/customers', 'POST', { name: `Deuda Check ${marcaDeuda}`, phone: `59597${String(marcaDeuda).slice(-7)}`, email: `deuda-${marcaDeuda}@example.invalid`, pricingTier: 'RETAIL', creditLimitPyg: 1000000, creditDays: 15, tags: ['etiqueta-check'], addresses: [{ label: 'Principal', address: 'Calle Falsa 123', city: 'Ciudad Check', isDefault: true }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const deudaCustomer = result.payload
result = await request('/api/orders', 'POST', { customerId: deudaCustomer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [], creditDays: 15 })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'PENDING')
result = await request('/api/customers?filtro=deuda&limit=500')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === deudaCustomer.id), 'filtro=deuda debe incluir al cliente con saldo pendiente.')
assert.ok(!result.payload.some(row => row.id === sinCredito.id), 'filtro=deuda no debe incluir clientes sin saldo pendiente.')
console.log('orders-credit-discounts · check clientes filtro=deuda: OK')
result = await request(`/api/customers?filtro=credito&q=${encodeURIComponent(deudaCustomer.name)}&limit=500`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === deudaCustomer.id), 'filtro=credito debe incluir al cliente con límite.')
result = await request(`/api/customers?filtro=sincredito&q=${encodeURIComponent(deudaCustomer.name)}&limit=500`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.length, 0, 'filtro=sincredito debe excluir al cliente con límite.')
result = await request(`/api/customers?filtro=conemail&q=${encodeURIComponent(deudaCustomer.name)}&limit=500`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === deudaCustomer.id), 'filtro=conemail debe incluir fichas con correo.')
result = await request(`/api/customers?q=${encodeURIComponent('Ciudad Check')}&limit=500`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === deudaCustomer.id), 'q debe encontrar por ciudad de la dirección.')
result = await request(`/api/customers?q=${encodeURIComponent('etiqueta-check')}&limit=500`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === deudaCustomer.id), 'q debe encontrar por etiqueta.')
console.log('orders-credit-discounts · check clientes filtro credito/sincredito/conemail y q ciudad/etiqueta: OK')

// Cotizaciones: paginación por cursor y filtro por estado en el servidor.
const cotizacionesPagina1 = await request('/api/quotes?limit=1')
assert.equal(cotizacionesPagina1.response.status, 200, JSON.stringify(cotizacionesPagina1.payload))
assert.equal(cotizacionesPagina1.payload.length, 1, 'limit=1 debe devolver una sola cotización.')
const cotizacionesPagina2 = await request(`/api/quotes?limit=1&cursor=${cotizacionesPagina1.payload[0].id}`)
assert.equal(cotizacionesPagina2.response.status, 200, JSON.stringify(cotizacionesPagina2.payload))
assert.ok(cotizacionesPagina2.payload.length <= 1, 'La página siguiente de cotizaciones respeta el límite.')
assert.ok(!cotizacionesPagina2.payload.some(row => row.id === cotizacionesPagina1.payload[0].id), 'La página siguiente de cotizaciones no repite el cursor.')
console.log('orders-credit-discounts · check cotizaciones limit/cursor: OK')
result = await request('/api/quotes?status=CONVERTED&limit=200')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === quote.id), 'status=CONVERTED debe incluir la cotización convertida.')
assert.ok(result.payload.every(row => row.status === 'CONVERTED'), 'status=CONVERTED no debe mezclar otros estados.')
result = await request('/api/quotes?status=DRAFT&limit=200')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.every(row => row.status === 'DRAFT'), 'status=DRAFT debe devolver solo borradores.')
assert.ok(!result.payload.some(row => row.id === quote.id), 'status=DRAFT no debe incluir la cotización convertida.')
result = await request(`/api/quotes?q=${encodeURIComponent(quote.number)}&limit=200`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.some(row => row.id === quote.id), 'q debe encontrar la cotización por número.')
console.log('orders-credit-discounts · check cotizaciones status y q: OK')

// Garantías: el listado incluye el teléfono del cliente para avisos.
const garantias = await request('/api/warranties?kind=COVERAGE')
assert.equal(garantias.response.status, 200)
const conTelefono = garantias.payload.find((row) => row.serial === warrantySerialKey)
assert.ok(conTelefono, 'La garantía automática debe aparecer en el listado de servicio.')
assert.ok(conTelefono.customerPhone, 'La garantía debe traer el teléfono del cliente.')

// Numeración configurable por empresa: con prefijo propio el siguiente pedido
// sale `TST-#0007` (contador transaccional) y el display lo muestra `TST #0007`.
result = await request('/api/account', 'POST', { password: 'company-password-it' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await request('/api/account', 'PATCH', { action: 'orderNumbering', prefix: 'TST', start: 7 })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.preview, 'TST-#0007')
result = await request('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPricePyg: 800000 }], payments: [{ method: 'CASH', amountPyg: 800000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
assert.equal(result.payload.orderNumber, 'TST-#0007', `La empresa con prefijo propio debe seguir su contador, recibido ${result.payload.orderNumber}.`)
assert.equal(codigoPedido(result.payload.orderNumber), 'TST #0007')
console.log('orders-credit-discounts · check numeración TST-#0007 y display: OK')
// Se restaura el prefijo por defecto sin retroceder el contador (GREATEST con
// el máximo histórico): el resto de la suite sigue viendo MOB-#NNNN.
const maxSecuencia = async (prefix) => {
  const pattern = new RegExp(`^${prefix}-#(\\d+)$`)
  let max = 0
  let cursor
  for (;;) {
    const page = await request(`/api/orders?filtro=todos&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    assert.equal(page.response.status, 200, JSON.stringify(page.payload))
    for (const row of page.payload) {
      const match = String(row.orderNumber || '').match(pattern)
      if (match) max = Math.max(max, Number(match[1]))
    }
    if (page.payload.length < 500) return max
    cursor = page.payload[page.payload.length - 1].id
  }
}
result = await request('/api/account', 'PATCH', { action: 'orderNumbering', prefix: 'MOB', start: (await maxSecuencia('MOB')) + 1 })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))

// ── Autorizaciones genéricas: venta por debajo de lista ─────────────────────
// El precio de lista mayorista de un producto nuevo es 550.000: vender en
// 530.000 sin autorización se rechaza con un motivo accionable.
let resultProductoBajo = await request('/api/products', 'POST', { sku: `BAJO-SKU-${Date.now()}`, name: 'Equipo precio bajo lista', pricePyg: 600000, wholesalePricePyg: 550000, stock: 5, branchId: 'branch-a-it' })
assert.equal(resultProductoBajo.response.status, 201, JSON.stringify(resultProductoBajo.payload))
const productoBajoLista = resultProductoBajo.payload
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: productoBajoLista.id, quantity: 1, unitPricePyg: 530000 }], payments: [{ method: 'CASH', amountPyg: 530000 }] })
assert.equal(result.response.status, 403, 'Vender bajo lista sin autorización debe rechazarse.')
assert.match(String(result.payload?.message || ''), /debajo de lista/i)

// El vendedor pide autorización por 50.000 de diferencia; gerencia autoriza
// MENOS (30.000) y la pendiente duplicada del mismo sujeto se bloquea.
result = await sellerRequest('/api/authorizations', 'POST', { customerId: customer.id, kind: 'BELOW_LIST_PRICE', requestedValue: { discountPyg: 50000, productId: productoBajoLista.id }, note: 'Precio especial acordado con el cliente.' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authPrecio = result.payload
assert.equal(authPrecio.status, 'PENDING')
assert.equal(authPrecio.entity, 'PRODUCT')
assert.equal(authPrecio.entityId, productoBajoLista.id)
assert.deepEqual(authPrecio.requestedValue, { discountPyg: 50000, productId: productoBajoLista.id })
result = await sellerRequest('/api/authorizations', 'POST', { customerId: customer.id, kind: 'BELOW_LIST_PRICE', requestedValue: { discountPyg: 10000, productId: productoBajoLista.id } })
assert.equal(result.response.status, 409, 'No puede haber dos pendientes del mismo tipo y sujeto.')
result = await request('/api/authorizations', 'PATCH', { id: authPrecio.id, action: 'approve', resolvedValue: { maxDiscountPyg: 30000 }, resolvedNote: 'Máximo autorizado: 30.000.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.resolvedValue, { maxDiscountPyg: 30000 })

// Por encima del máximo autorizado la venta se rechaza; dentro del máximo se
// crea, consume la autorización y audita el precio autorizado en el pedido.
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: productoBajoLista.id, quantity: 1, unitPricePyg: 510000 }], payments: [{ method: 'CASH', amountPyg: 510000 }], priceAuthorizationId: authPrecio.id })
assert.equal(result.response.status, 403, 'La autorización de precio no puede cubrir más que su máximo.')
assert.match(String(result.payload?.message || ''), /no alcanza/i)
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: productoBajoLista.id, quantity: 1, unitPricePyg: 530000 }], payments: [{ method: 'CASH', amountPyg: 530000 }], priceAuthorizationId: authPrecio.id })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const ventaBajoLista = result.payload
assert.equal(ventaBajoLista.items[0].listPricePyg, 550000, 'La venta debe congelar el precio de lista.')
result = await sellerRequest(`/api/orders/${encodeURIComponent(ventaBajoLista.id)}/history`)
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.events.some(event => event.action === 'ORDER_PRICE_AUTHORIZED'), 'La cronología debe auditar el precio autorizado.')
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: productoBajoLista.id, quantity: 1, unitPricePyg: 530000 }], payments: [{ method: 'CASH', amountPyg: 530000 }], priceAuthorizationId: authPrecio.id })
assert.equal(result.response.status, 403, 'Una autorización de precio usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// ── Autorizaciones de stock: retiro de una unidad ───────────────────────────
const serialStock = `STOCK-AUTH-${Date.now()}`
result = await request('/api/products', 'POST', { sku: `STOCK-AUTH-SKU-${Date.now()}`, name: 'Equipo ajuste autorizado', pricePyg: 300000, stock: 1, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoStock = result.payload
result = await request('/api/inventory-units', 'POST', { productId: productoStock.id, branchId: 'branch-a-it', serial: serialStock, condition: 'NEW' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const unidadStock = Array.isArray(result.payload) ? result.payload[0] : result.payload

// Sin autorización el vendedor no retira; la solicitud con motivo se aprueba.
result = await sellerRequest('/api/inventory-units', 'PATCH', { id: unidadStock.id, action: 'remove', reason: 'Equipo dañado en exhibición' })
assert.equal(result.response.status, 403, 'Un vendedor no puede retirar stock sin autorización.')
assert.match(String(result.payload?.message || ''), /autorizaci/i)
result = await sellerRequest('/api/authorizations', 'POST', { kind: 'STOCK_ADJUST', requestedValue: { unitId: unidadStock.id, action: 'remove', reason: 'Equipo dañado en exhibición' } })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authStock = result.payload
assert.equal(authStock.entity, 'INVENTORY_UNIT')
assert.equal(authStock.entityId, unidadStock.id)
result = await request('/api/authorizations', 'PATCH', { id: authStock.id, action: 'approve', resolvedValue: { approved: true }, resolvedNote: 'Autorizado el retiro.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.deepEqual(result.payload.resolvedValue, { approved: true })

// Con la autorización aprobada el retiro se ejecuta, consume la autorización y
// el reintento queda bloqueado.
result = await sellerRequest('/api/inventory-units', 'PATCH', { id: unidadStock.id, action: 'remove', reason: 'Equipo dañado en exhibición', authorizationId: authStock.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'DEFECTIVE')
result = await sellerRequest('/api/authorizations?mine=1&kind=STOCK_ADJUST')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const authStockUsada = result.payload.find(row => row.id === authStock.id)
assert.ok(authStockUsada?.usedAt, 'La autorización de stock debe quedar consumida.')
result = await sellerRequest('/api/inventory-units', 'PATCH', { id: unidadStock.id, action: 'remove', reason: 'Equipo dañado en exhibición', authorizationId: authStock.id })
assert.equal(result.response.status, 403, 'Una autorización de stock usada no puede reutilizarse.')
assert.match(String(result.payload?.message || ''), /se usó/i)

// ── Autorizaciones de anulación: pedido del vendedor ────────────────────────
const serialVoid = `VOID-AUTH-${Date.now()}`
result = await request('/api/products', 'POST', { sku: `VOID-AUTH-SKU-${Date.now()}`, name: 'Equipo anulación autorizada', pricePyg: 400000, stock: 1, branchId: 'branch-a-it' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const productoVoid = result.payload
result = await request('/api/inventory-units', 'POST', { productId: productoVoid.id, branchId: 'branch-a-it', serial: serialVoid, condition: 'NEW' })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
result = await sellerRequest('/api/orders', 'POST', { customerId: customer.id, items: [{ productId: productoVoid.id, quantity: 1, unitPricePyg: 400000, inventoryUnitSerials: [serialVoid] }], payments: [{ method: 'CASH', amountPyg: 400000 }] })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const pedidoAnulable = result.payload
assert.equal(pedidoAnulable.items[0].serials[0], serialVoid.replace(/[^A-Z0-9]/gi, '').toUpperCase())

// Sin permiso el vendedor no anula; con la aprobada anula, repone la unidad y
// el reintento queda bloqueado (el pedido ya está cancelado y la autorización
// consumida).
result = await sellerRequest(`/api/orders/${encodeURIComponent(pedidoAnulable.id)}/void`, 'POST', { reason: 'Cliente canceló la compra' })
assert.equal(result.response.status, 403, 'Un vendedor no puede anular un pedido sin autorización.')
result = await sellerRequest('/api/authorizations', 'POST', { kind: 'ORDER_VOID', requestedValue: { orderId: pedidoAnulable.id, kind: 'full', reason: 'Cliente canceló la compra' } })
assert.equal(result.response.status, 201, JSON.stringify(result.payload))
const authVoid = result.payload
assert.equal(authVoid.entity, 'ORDER')
assert.equal(authVoid.entityId, pedidoAnulable.id)
result = await request('/api/authorizations', 'PATCH', { id: authVoid.id, action: 'approve', resolvedValue: { approved: true }, resolvedNote: 'Autorizado.' })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
result = await sellerRequest(`/api/orders/${encodeURIComponent(pedidoAnulable.id)}/void`, 'POST', { reason: 'Cliente canceló la compra', authorizationId: authVoid.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.status, 'CANCELLED')
assert.equal(result.payload.restoredUnits, 1)
result = await request('/api/orders?filtro=todos')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const pedidoAnulado = result.payload.find(row => row.id === pedidoAnulable.id)
assert.equal(pedidoAnulado?.status, 'CANCELLED', 'El pedido anulado debe quedar cancelado.')
assert.ok(pedidoAnulado.payments.some(pago => pago.status === 'CONFIRMED'), 'La anulación no borra los pagos cobrados.')
result = await request('/api/inventory-units?q=' + encodeURIComponent(serialVoid.replace(/[^A-Z0-9]/gi, '').toUpperCase()))
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const unidadRepuesta = result.payload.find(unit => unit.serial === serialVoid.replace(/[^A-Z0-9]/gi, '').toUpperCase())
assert.equal(unidadRepuesta?.status, 'AVAILABLE', 'La unidad vendida debe volver a disponible al anular.')
result = await sellerRequest(`/api/orders/${encodeURIComponent(pedidoAnulable.id)}/void`, 'POST', { reason: 'Cliente canceló la compra', authorizationId: authVoid.id })
assert.equal(result.response.status, 403, 'Un pedido ya anulado (y su autorización usada) no se anula dos veces.')
assert.match(String(result.payload?.message || ''), /se usó/i)

console.log('orders-credit-discounts: OK (numeración secuencial MOB-#####, descuentos fijo/%, mayorista, crédito con límite y mora, autorizaciones genéricas con sujeto — precio bajo lista, ajuste de stock y anulación de pedido, con consumo de un solo uso —, acreditación de tarjeta, garantía pública y automática, etiquetas, archivado, comentarios con foto, aviso WhatsApp, plantillas por categoría, pipeline de cotizaciones y combos).')
