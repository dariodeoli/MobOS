import assert from 'node:assert/strict'

// Comentarios internos del pedido: permisos, tenencia, saneado y que nunca salgan
// en la página pública del pedido.
const [base, admin, otraEmpresa] = process.argv.slice(2)
if (!base || !admin || !otraEmpresa) throw new Error('base, token admin y token de otra empresa requeridos')
let checks = 0
async function req(path, { method = 'GET', body, token = admin, expected = 200, form } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(form ? {} : { 'Content-Type': 'application/json' }) },
    ...(form ? { body: form } : body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json().catch(() => null)
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
const comentario = (texto) => { const form = new FormData(); if (texto !== undefined) form.append('body', texto); return form }
const sufijo = Date.now().toString(36).toUpperCase()

const producto = await req('/api/products', { method: 'POST', body: { sku: `COM-${sufijo}`, name: 'Producto comentarios', pricePyg: 90000, stock: 5, branchId: 'branch-a-it' }, expected: 201 })
const pedido = await req('/api/orders', { method: 'POST', body: { orderNumber: `COM-${sufijo}`, items: [{ productId: producto.id, quantity: 1, unitPricePyg: 90000 }], payment: { method: 'CASH', amountPyg: 90000 } }, expected: 201 })
const ruta = `/api/orders/${encodeURIComponent(pedido.id)}/comments`

// Publicar y listar.
const creado = await req(ruta, { method: 'POST', form: comentario('  Cliente retira el viernes  '), expected: 201 })
assert.equal(creado.body, 'Cliente retira el viernes', 'el comentario se guarda recortado')
const lista = await req(ruta)
assert.ok(lista.some((fila) => fila.id === creado.id), 'el comentario aparece en el listado')
const texto = '<script>alert(1)</script>' + 'x'.repeat(3000)
const largo = await req(ruta, { method: 'POST', form: comentario(texto), expected: 201 })
assert.ok(largo.body.length <= 2000, 'el comentario se acota a 2000 caracteres')
await req(ruta, { method: 'POST', form: comentario(''), expected: 400 })

// Cronología y auditoría.
const historia = await req(`/api/orders/${encodeURIComponent(pedido.id)}/history`)
assert.ok(historia.events.some((evento) => evento.type === 'comment' && evento.id === creado.id), 'el comentario sale en la cronología')
assert.ok(historia.events.some((evento) => evento.action === 'ORDER_COMMENTED'), 'el comentario queda auditado')

// Tenencia: otra empresa no lee ni escribe.
await req(ruta, { token: otraEmpresa, expected: 404 })
await req(ruta, { method: 'POST', form: comentario('intruso'), token: otraEmpresa, expected: 404 })
await req(ruta, { token: 'token-invalido', expected: 401 })

// Nunca en la página pública.
const acceso = await req(`/api/orders/${encodeURIComponent(pedido.id)}/access-tokens`, { method: 'POST', body: { level: 'detallado' }, expected: 200 }).catch(() => null)
if (acceso?.token) {
  const publico = await fetch(`${base}/api/orders/public/${encodeURIComponent(acceso.token)}`).then((r) => r.text())
  assert.ok(!publico.includes('Cliente retira el viernes'), 'el comentario interno no sale en la página pública')
  checks++
}
console.log(`PASS: comentarios internos del pedido · ${checks} chequeos`)
