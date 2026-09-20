// Cobranzas por WhatsApp y campañas de recompra (#81, #82).
// Uso: collections-marketing.mjs <baseUrl> <adminToken> <sellerToken> <databaseUrl>
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [baseUrl, adminToken, sellerToken, databaseUrl] = process.argv.slice(2)
if (!baseUrl || !adminToken || !sellerToken || !databaseUrl) throw new Error('Uso: collections-marketing.mjs <baseUrl> <adminToken> <sellerToken> <databaseUrl>')
const pgBin = process.env.MOBOS_TEST_PG_BIN || '/opt/homebrew/bin'
const psql = (sql) => execFileSync(join(pgBin, 'psql'), ['-X', '--no-psqlrc', '-At', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-c', sql], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim()

async function request(path, method = 'GET', body, token = adminToken, tenant = 'tenant-a-it') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenant, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

const ts = Date.now()
const suffix = `cm-${ts}`

// ── Datos: clientes con teléfono/opt-in, compras y cuotas a crédito ────────
// Teléfonos únicos por cliente: el alta deduplica por teléfono (upsert).
async function crearCliente(nombre, optIn, indice) {
  const { response, payload } = await request('/api/customers', 'POST', { name: nombre, phone: `981${String(ts).slice(-5)}${indice}`, countryCode: '+595', acceptsWhatsappMarketing: optIn })
  assert.ok([200, 201].includes(response.status), JSON.stringify(payload))
  return payload
}

async function crearCompra(customerId, orderNumber) {
  const { response, payload } = await request('/api/orders', 'POST', {
    orderNumber,
    customerId,
    items: [{ productId: 'prod-a-order-it', description: 'Synthetic Product A Order', quantity: 1, unitPricePyg: 100000 }],
    payment: { method: 'CASH', amountPyg: 100000 },
  })
  assert.equal(response.status, 201, JSON.stringify(payload))
  return payload
}

const clienteActivo = await crearCliente(`Cliente Campaña ${ts}`, true, 1)
const clienteSinOptIn = await crearCliente(`Cliente Sin Opt-In ${ts}`, false, 2)
const clienteSinCompras = await crearCliente(`Cliente Sin Compras ${ts}`, true, 3)
const ordenActivo = await crearCompra(clienteActivo.id, `CM-ACT-${ts}`)
const ordenSinOptIn = await crearCompra(clienteSinOptIn.id, `CM-NOOPT-${ts}`)
// Las últimas compras se retrasan 10 días por SQL para probar el segmento inactivo.
psql(`UPDATE "Order" SET "createdAt" = now() - interval '10 days' WHERE "id" IN ('${ordenActivo.id}', '${ordenSinOptIn.id}');`)

// Cuota a crédito vencida hace 5 días, creada por el API (dueAt nuevo) y otra
// por vencer en 2 días.
const { response: creditResponse, payload: creditOrder } = await request('/api/orders', 'POST', {
  orderNumber: `CM-CREDIT-${ts}`,
  customerId: clienteActivo.id,
  items: [{ productId: 'prod-a-rollback-it', description: 'Synthetic Product A Rollback', quantity: 1, unitPricePyg: 100000 }],
})
assert.equal(creditResponse.status, 201, JSON.stringify(creditOrder))
const vencidaAt = new Date(Date.now() - 5 * 86400000).toISOString()
const { response: pagoVencido, payload: cuotaVencida } = await request('/api/payments', 'POST', { orderId: creditOrder.id, method: 'CREDIT', status: 'PENDING', amountPyg: 40000, reference: `Cuota 1/2 ${suffix}`, dueAt: vencidaAt })
assert.equal(pagoVencido.status, 201, JSON.stringify(cuotaVencida))
assert.equal(new Date(cuotaVencida.dueAt).getTime(), new Date(vencidaAt).getTime(), 'El pago a crédito debe guardar el vencimiento.')
const { response: pagoProximo, payload: cuotaProxima } = await request('/api/payments', 'POST', { orderId: creditOrder.id, method: 'CREDIT', status: 'PENDING', amountPyg: 40000, reference: `Cuota 2/2 ${suffix}`, dueAt: new Date(Date.now() + 2 * 86400000).toISOString() })
assert.equal(pagoProximo.status, 201, JSON.stringify(cuotaProxima))
// El vencimiento solo aplica a cuotas a crédito pendientes.
const invalido = await request('/api/payments', 'POST', { orderId: creditOrder.id, method: 'CASH', amountPyg: 1000, dueAt: vencidaAt })
assert.equal(invalido.response.status, 400, 'Un pago no pendiente a crédito no admite vencimiento.')
psql(`UPDATE "Payment" SET "dueAt" = now() - interval '5 days' WHERE "id" = '${cuotaVencida.id}';`)

// ── #81: recordatorios por WhatsApp con mora ───────────────────────────────
let result = await request('/api/collections/reminders', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 403, 'Cobranzas por WhatsApp no es para vendedores.')
result = await request('/api/collections/reminders')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(result.payload.moraBpPorDia, 0, 'Sin configuración no hay recargo por mora.')
const filaVencida = result.payload.rows.find((row) => row.id === cuotaVencida.id)
assert.ok(filaVencida, 'La cuota vencida debe listarse.')
assert.equal(filaVencida.tipo, 'VENCIDA')
assert.ok(filaVencida.diasAtraso >= 5, `Días de atraso esperados >= 5: ${JSON.stringify(filaVencida)}`)
assert.equal(filaVencida.saldoPendientePyg, 40000)
assert.equal(filaVencida.recargoPyg, 0)
assert.ok(filaVencida.whatsappUrl.startsWith('https://wa.me/595'), 'La cuota con teléfono debe traer el enlace wa.me.')
assert.ok(filaVencida.message.includes(clienteActivo.name), 'El mensaje debe estar renderizado con el cliente.')
assert.equal(filaVencida.avisadoEn, null)
const filaProxima = result.payload.rows.find((row) => row.id === cuotaProxima.id)
assert.ok(filaProxima && filaProxima.tipo === 'PROXIMA', 'La cuota por vencer debe listarse como próxima.')
// Filtro por tipo.
result = await request('/api/collections/reminders?kind=overdue')
assert.ok(result.payload.rows.every((row) => row.tipo === 'VENCIDA'))

// Recargo configurado por empresa (0,5 % diario): 40.000 × 0,005 × 5 = 1.000.
psql(`UPDATE "Tenant" SET "collectionLateFeeBpPerDay" = 50 WHERE "id" = 'tenant-a-it';`)
result = await request('/api/collections/reminders')
const conRecargo = result.payload.rows.find((row) => row.id === cuotaVencida.id)
assert.equal(conRecargo.recargoPyg, 1000, 'El recargo por mora debe calcularse con la tasa configurada.')
assert.ok(conRecargo.message.includes('Recargo por mora'), 'El mensaje debe anunciar el recargo cuando existe.')
assert.equal(conRecargo.totalPyg, 41000)

// Aviso: se marca una sola vez y queda auditado en pedido y cliente.
result = await request('/api/collections/reminders', 'POST', { paymentId: cuotaVencida.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.ok(result.payload.avisadoEn, 'La respuesta debe informar cuándo se recordó.')
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "id" = '${cuotaVencida.id}' AND "whatsappOverdueRemindedAt" IS NOT NULL;`), '1', 'El aviso debe marcar whatsappOverdueRemindedAt.')
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "id" = '${cuotaVencida.id}' AND "overdueRemindedAt" IS NULL AND "remindedAt" IS NULL;`), '1', 'El aviso por WhatsApp no debe consumir el email.')
result = await request('/api/collections/reminders', 'POST', { paymentId: cuotaVencida.id })
assert.equal(result.response.status, 409, 'La misma cuota no se recuerda dos veces.')
result = await request('/api/collections/reminders', 'POST', { paymentId: cuotaVencida.id, force: true })
assert.equal(result.response.status, 200, 'Un reenvío explícito debe permitirse.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "entity" = 'Order' AND "entityId" = '${creditOrder.id}' AND "action" = 'ORDER_COLLECTION_WHATSAPP_REMINDED' AND ("metadata"->>'reenvio')::boolean IS TRUE;`), '1', 'El reenvío debe quedar auditado como tal.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "entity" = 'Customer' AND "entityId" = '${clienteActivo.id}' AND "action" = 'COLLECTION_WHATSAPP_REMINDED';`), '2', 'Cada aviso debe quedar en la cronología del cliente.')
const historial = await request(`/api/orders/${creditOrder.id}/history`)
assert.equal(historial.response.status, 200, JSON.stringify(historial.payload))
assert.ok(historial.payload.events.some((event) => event.action === 'ORDER_COLLECTION_WHATSAPP_REMINDED'), 'La cronología del pedido debe mostrar el recordatorio.')
const timeline = await request(`/api/customers/${clienteActivo.id}/timeline`)
assert.equal(timeline.response.status, 200, JSON.stringify(timeline.payload))
assert.ok(timeline.payload.events.some((event) => event.action === 'COLLECTION_WHATSAPP_REMINDED'), 'La cronología del cliente debe mostrar el recordatorio.')
// Cuota próxima: marca su propio flag.
result = await request('/api/collections/reminders', 'POST', { paymentId: cuotaProxima.id })
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
assert.equal(psql(`SELECT COUNT(*) FROM "Payment" WHERE "id" = '${cuotaProxima.id}' AND "whatsappRemindedAt" IS NOT NULL;`), '1', 'La cuota próxima marca whatsappRemindedAt.')
// Sin teléfono no hay enlace ni aviso: la cuota pertenece a un cliente sin
// teléfono, en su propio pedido (el vínculo es por pedido, no por pago).
const sinTelefono = await request('/api/customers', 'POST', { name: `Cliente Sin Tel ${ts}` })
const ordenSinTel = await request('/api/orders', 'POST', { orderNumber: `CM-SINTEL-${ts}`, customerId: sinTelefono.payload.id, items: [{ description: 'Servicio sin teléfono', quantity: 1, unitPricePyg: 5000 }] })
assert.equal(ordenSinTel.response.status, 201, JSON.stringify(ordenSinTel.payload))
const cuotaSinTel = await request('/api/payments', 'POST', { orderId: ordenSinTel.payload.id, method: 'CREDIT', status: 'PENDING', amountPyg: 1000, reference: `Sin tel ${suffix}`, dueAt: vencidaAt })
assert.equal(cuotaSinTel.response.status, 201, JSON.stringify(cuotaSinTel.payload))
const avisoSinTel = await request('/api/collections/reminders', 'POST', { paymentId: cuotaSinTel.payload.id })
assert.equal(avisoSinTel.response.status, 409, 'Sin teléfono no se puede recordar.')
result = await request('/api/collections/reminders')
assert.equal(result.payload.rows.find((row) => row.id === cuotaSinTel.payload.id).whatsappUrl, null)
void sinTelefono

// ── #82: segmentos y campañas de recompra ──────────────────────────────────
// La última compra del cliente activo queda retrasada: así el segmento de
// inactivos (5 días) lo incluye pese a las cuotas creadas recién.
psql(`UPDATE "Order" SET "createdAt" = now() - interval '12 days' WHERE "customerId" = '${clienteActivo.id}';`)
result = await request('/api/customers/segments?segment=INACTIVE', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 403, 'Los segmentos de marketing no son para vendedores.')
result = await request('/api/customers/segments?segment=NO_EXISTE')
assert.equal(result.response.status, 400, 'Un segmento inválido debe rechazarse.')
result = await request('/api/customers/segments?segment=INACTIVE&days=5')
assert.equal(result.response.status, 200, JSON.stringify(result.payload))
const idsInactivos = result.payload.rows.map((row) => row.id)
assert.ok(idsInactivos.includes(clienteActivo.id), 'El cliente con compra de hace 10 días es inactivo.')
assert.ok(idsInactivos.includes(clienteSinOptIn.id), 'El cliente sin opt-in sigue siendo del segmento (pero no elegible).')
assert.ok(!idsInactivos.includes(clienteSinCompras.id), 'Un cliente sin compras no es inactivo.')
const sinOptIn = result.payload.rows.find((row) => row.id === clienteSinOptIn.id)
assert.equal(sinOptIn.eligible, false)
assert.equal(sinOptIn.reason, 'sin_opt_in')
result = await request('/api/customers/segments?segment=NO_PURCHASES')
assert.ok(result.payload.rows.some((row) => row.id === clienteSinCompras.id), 'Nunca compraron debe incluir la ficha sin pedidos.')
result = await request('/api/customers/segments?segment=CATEGORY&category=test')
assert.ok(result.payload.rows.some((row) => row.id === clienteActivo.id), 'El segmento por categoría debe comparar sin distinguir mayúsculas.')
result = await request('/api/customers/segments?segment=FREQUENT&minOrders=1')
assert.ok(result.payload.rows.some((row) => row.id === clienteActivo.id), 'Recurrentes con mínimo 1 incluye al cliente con compra.')

// Campaña: solo el cliente con opt-in recibe enlace; el otro queda omitido.
result = await request('/api/marketing/campaigns', 'GET', undefined, sellerToken)
assert.equal(result.response.status, 403, 'Las campañas no son para vendedores.')
const plantilla = await request('/api/message-templates?category=CUSTOMERS')
const plantillaRecompra = plantilla.payload.find((item) => item.isActive !== false)
const plantillaPedidos = (await request('/api/message-templates?category=ORDERS')).payload[0]
const crearCampana = (customerIds, templateKey, extra = {}) => request('/api/marketing/campaigns', 'POST', { segment: 'INACTIVE', days: 5, cooldownDays: 30, templateKey, customerIds, ...extra })
result = await crearCampana([clienteActivo.id, clienteSinOptIn.id], plantillaPedidos.key)
assert.equal(result.response.status, 404, 'Una plantilla de otra categoría no sirve para marketing.')
result = await crearCampana([clienteActivo.id, clienteSinOptIn.id], plantillaRecompra.key)
assert.equal(result.response.status, 201, JSON.stringify({ campaign: result.payload?.campaign, skipped: result.payload?.skipped }))
assert.equal(result.payload.recipients.length, 1, 'Solo el cliente con opt-in recibe el mensaje.')
assert.equal(result.payload.recipients[0].customerId, clienteActivo.id)
assert.ok(result.payload.recipients[0].whatsappUrl.startsWith('https://wa.me/595'))
assert.equal(result.payload.skipped.length, 1)
assert.equal(result.payload.skipped[0].reason, 'sin_opt_in')
const campanaId = result.payload.campaign.id
assert.equal(psql(`SELECT COUNT(*) FROM "MarketingRecipient" WHERE "campaignId" = '${campanaId}';`), '1', 'El registro por destinatario debe quedar guardado.')
assert.equal(psql(`SELECT COUNT(*) FROM "Customer" WHERE "id" = '${clienteActivo.id}' AND "marketingContactedAt" IS NOT NULL;`), '1', 'El cliente contactado debe marcarse.')
assert.equal(psql(`SELECT COUNT(*) FROM "Customer" WHERE "id" = '${clienteSinOptIn.id}' AND "marketingContactedAt" IS NULL;`), '1', 'El cliente omitido no debe marcarse.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'MARKETING_WHATSAPP_SENT' AND "entityId" = '${clienteActivo.id}';`), '1', 'El envío debe quedar auditado.')
assert.equal(psql(`SELECT COUNT(*) FROM "AuditLog" WHERE "action" = 'MARKETING_CAMPAIGN_CREATED' AND "entityId" = '${campanaId}';`), '1', 'La campaña debe quedar auditada.')
result = await request('/api/marketing/campaigns')
assert.ok(result.payload.campaigns.some((campaign) => campaign.id === campanaId && campaign.recipientCount === 1), 'La campaña debe listarse con su conteo.')

// No repetir: con la ventana de enfriamiento el cliente ya no es elegible.
result = await crearCampana([clienteActivo.id], plantillaRecompra.key)
assert.equal(result.response.status, 201)
assert.equal(result.payload.recipients.length, 0, 'El cliente ya contactado no se repite.')
assert.equal(result.payload.skipped[0].reason, 'contactado_reciente')
result = await request('/api/customers/segments?segment=INACTIVE&days=5')
assert.equal(result.payload.rows.find((row) => row.id === clienteActivo.id).eligible, false)
// Sin enfriamiento (0 días) vuelve a estar disponible.
result = await request('/api/customers/segments?segment=INACTIVE&days=5&cooldownDays=0')
assert.equal(result.payload.rows.find((row) => row.id === clienteActivo.id).eligible, true)
// Aislamiento multi-tenant: ids de otra empresa no resuelven.
result = await crearCampana([clienteActivo.id, 'cliente-de-otra-empresa'], plantillaRecompra.key, { cooldownDays: 0 })
assert.equal(result.payload.recipients.length, 1, 'Un id ajeno no debe generar destinatario.')
result = await request('/api/marketing/campaigns', 'POST', { segment: 'INACTIVE', days: 5, templateKey: plantillaRecompra.key, customerIds: ['cliente-de-otra-empresa'] })
assert.equal(result.response.status, 404, 'Sin clientes propios no se crea campaña.')

console.log('collections-marketing: checks OK (recordatorios WhatsApp con mora, dedupe y auditoría; segmentos, opt-in, campañas y no repetir).')
