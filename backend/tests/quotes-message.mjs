import assert from 'node:assert/strict'

// #261 — Envío de la cotización al cliente: mensaje profesional para WhatsApp
// (texto + enlace público) y correo al email registrado; la cotización en
// borrador pasa a «enviada» y cada envío queda en la auditoría y en la
// cronología del cliente. Corre contra el seed del arnés.
const [base, admin, vendedor] = process.argv.slice(2)
if (!base || !admin) throw new Error('base y token admin requeridos')
let checks = 0
async function req(path, method = 'GET', body, expected = 200, token = admin) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}

const sufijo = Date.now().toString(36).toUpperCase()
const rama = 'branch-a-it'

// 1) Cliente con teléfono y correo + cotización en borrador.
const cliente = await req('/api/customers', 'POST', { name: `Cliente Cotización ${sufijo}`, phone: '0981123999', countryCode: '+595', email: `cotizacion-${sufijo.toLowerCase()}@ejemplo.com` }, 201)
const cotizacion = await req('/api/quotes', 'POST', {
  customerId: cliente.id,
  customerName: cliente.name,
  validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
  items: [
    { description: 'iPhone 15 · 128 GB', quantity: 1, unitPricePyg: 4850000 },
    { description: 'Funda de silicona', quantity: 2, unitPricePyg: 90000 },
  ],
}, 201)
assert.equal(cotizacion.status, 'DRAFT')
assert.ok(cotizacion.publicToken, 'la cotización debe tener token público para el enlace')

// 2) Vista previa (GET): mensaje profesional y enlace, sin efectos.
const previa = await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`)
assert.match(previa.message, new RegExp(`Hola ${cliente.name}`), 'el mensaje saluda al cliente')
assert.ok(previa.message.includes(cotizacion.number), 'el mensaje lleva el número')
assert.ok(previa.message.includes('iPhone 15 · 128 GB') && previa.message.includes('Funda de silicona'), 'el mensaje detalla los ítems')
assert.ok(previa.message.includes('Total: Gs. 5.030.000'), `el mensaje lleva el total: ${previa.message.slice(0, 200)}`)
assert.ok(previa.message.includes(`/cotizacion/${cotizacion.publicToken}`), 'el mensaje lleva el enlace público')
assert.ok(previa.whatsappUrl.startsWith('https://wa.me/595981123999?text='), `arma el enlace de WhatsApp: ${previa.whatsappUrl.slice(0, 60)}`)
const publica = await req(`/api/quotes/public/${encodeURIComponent(cotizacion.publicToken)}`)
assert.equal(publica.status, 'DRAFT', 'la vista previa no cambia el estado')

// 3) Envío por WhatsApp: mensaje + enlace, estado enviado y cronología.
const whatsapp = await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`, 'POST', { canal: 'WHATSAPP' })
assert.equal(whatsapp.canal, 'WHATSAPP')
assert.equal(whatsapp.status, 'SENT', 'compartir el borrador lo marca enviado')
assert.ok(whatsapp.whatsappUrl.includes('wa.me/595981123999'), 'devuelve el enlace de WhatsApp')
const auditoria = await req('/api/audit?q=QUOTE_MESSAGE_SENT&limit=100')
assert.ok(Array.isArray(auditoria) && auditoria.some((fila) => fila.action === 'QUOTE_MESSAGE_SENT' && fila.entityId === cotizacion.id), 'el envío queda auditado')
const cronoWhatsapp = await req(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
const eventoWhatsapp = cronoWhatsapp.events.find((evento) => evento.action === 'CUSTOMER_QUOTE_SHARED')
assert.ok(eventoWhatsapp, 'la cotización enviada aparece en la cronología')
assert.equal(eventoWhatsapp.label, 'Cotización enviada', 'la cronología la muestra con etiqueta legible')
assert.match(eventoWhatsapp.detail, /por WhatsApp/, `detalla el canal: ${eventoWhatsapp.detail}`)
assert.ok(eventoWhatsapp.detail.includes(cotizacion.number), 'la cronología cita la cotización')

// 4) Envío por correo: al email del cliente y también en la cronología.
const correo = await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`, 'POST', { canal: 'EMAIL' })
assert.equal(correo.queued, true, 'el correo se encola')
assert.equal(correo.to, cliente.email)
const cronoCorreo = await req(`/api/customers/${encodeURIComponent(cliente.id)}/timeline?limit=50`)
const eventosCorreo = cronoCorreo.events.filter((evento) => evento.action === 'CUSTOMER_QUOTE_SHARED')
assert.ok(eventosCorreo.some((evento) => /por correo/.test(evento.detail) && evento.detail.includes(cliente.email)), `la cronología registra el correo: ${JSON.stringify(eventosCorreo.map((e) => e.detail))}`)

// 5) Sin teléfono / sin correo: mensajes claros para completar la ficha.
const sinContacto = await req('/api/customers', 'POST', { name: `Cliente Sin Contacto ${sufijo}` }, 201)
const cotizacionSin = await req('/api/quotes', 'POST', { customerId: sinContacto.id, customerName: sinContacto.name, items: [{ description: 'Producto', quantity: 1, unitPricePyg: 100000 }] }, 201)
await req(`/api/quotes/${encodeURIComponent(cotizacionSin.id)}/message`, 'POST', { canal: 'WHATSAPP' }, 409)
await req(`/api/quotes/${encodeURIComponent(cotizacionSin.id)}/message`, 'POST', { canal: 'EMAIL' }, 409)

// 6) Validaciones y permisos.
await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`, 'POST', { canal: 'PALOMA' }, 400)
await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`, 'POST', { canal: 'EMAIL' }, 401, 'token-invalido')
await req('/api/quotes/inexistente/message', 'POST', { canal: 'WHATSAPP' }, 404)
if (vendedor) await req(`/api/quotes/${encodeURIComponent(cotizacion.id)}/message`, 'GET', undefined, 200, vendedor)

console.log(`PASS: cotización enviada por WhatsApp/correo con cronología · ${checks} chequeos`)
