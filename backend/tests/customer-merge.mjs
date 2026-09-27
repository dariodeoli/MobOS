import assert from 'node:assert/strict'

// #268 — Unificar clientes duplicados: preview de lo que se mueve, elección de
// la ficha principal, archivado del duplicado con puntero, permisos
// ADMIN/GERENTE, auditoría y cronología. Corre contra el seed del arnés.
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
async function publico(path) {
  const response = await fetch(base + path)
  const data = await response.json().catch(() => null)
  checks++
  return { status: response.status, data }
}

const sufijo = Date.now().toString(36).toUpperCase()

// 1) Dos fichas del mismo teléfono (el caso típico de duplicado). El alta
// actualiza la ficha existente si el teléfono coincide, así que el duplicado se
// crea con otro teléfono y después se edita: es el caso real a unificar.
const principal = await req('/api/customers', 'POST', { name: `Principal ${sufijo}`, phone: `0981${String(Date.now()).slice(-6)}` }, 201)
const telefono = String(principal.phone)
const duplicado = await req('/api/customers', 'POST', { name: `Duplicado ${sufijo}`, phone: `0982${String(Date.now()).slice(-6)}`, email: `dup-${sufijo.toLowerCase()}@ejemplo.com`, tags: ['whatsapp'], creditLimitPyg: 500000 }, 201)
await req(`/api/customers/${encodeURIComponent(duplicado.id)}`, 'PATCH', { phone: telefono })
const detalleDuplicado = await req(`/api/customers/${encodeURIComponent(duplicado.id)}`)
assert.equal(detalleDuplicado.customer.phone, telefono, 'el duplicado quedó con el teléfono repetido')

// 2) El duplicado tiene historia: pedido con pago, nota, dirección y garantía.
const producto = await req('/api/products', 'POST', { sku: `MERGE-${sufijo}`, name: 'Producto merge', pricePyg: 200000, stock: 3, branchId: 'branch-a-it' }, 201)
const pedido = await req('/api/orders', 'POST', {
  orderNumber: `MERGE-${sufijo}`,
  customerId: duplicado.id,
  items: [{ productId: producto.id, description: 'Producto merge', quantity: 1, unitPricePyg: 200000 }],
  payment: { method: 'CASH', amountPyg: 80000 },
}, 201)
await req(`/api/customers/${encodeURIComponent(duplicado.id)}/notes`, 'POST', { content: `Nota del duplicado ${sufijo}` }, 201)
await req(`/api/customers/${encodeURIComponent(duplicado.id)}`, 'PATCH', { addresses: [{ label: 'Casa', address: `Calle Merge ${sufijo}`, city: 'Asunción', country: 'Paraguay', isDefault: true }] })
const garantia = await req('/api/warranties', 'POST', { customerId: duplicado.id, customerName: duplicado.name, serial: `MERGESER${sufijo}`, description: 'Equipo merge', branchId: 'branch-a-it' }, 201)
const token = await req(`/api/customers/${encodeURIComponent(duplicado.id)}/access-token`, 'POST', { level: 'rapido' })
assert.ok(token.token || token.reused, 'el duplicado tiene enlace de portal')

// 3) Preview: qué se mueve y qué se completa.
const preview = await req(`/api/customers/${encodeURIComponent(principal.id)}/merge?with=${encodeURIComponent(duplicado.id)}`)
assert.equal(preview.b.conteos.orders, 1, 'el preview cuenta el pedido del duplicado')
assert.equal(preview.b.conteos.payments, 1, 'el preview cuenta el pago')
assert.equal(preview.b.conteos.notes, 1)
assert.equal(preview.b.conteos.addresses, 1)
assert.equal(preview.b.conteos.warranties, 1)
assert.equal(preview.b.conteos.portalTokens, 1)
assert.ok(preview.a.rellenados.includes('email'), 'el correo del duplicado completaría al principal')
assert.ok(Array.isArray(preview.b.rellenados), 'el preview informa qué completaría cada lado')
assert.ok(Array.isArray(preview.conflictos), 'el preview informa conflictos')

// 4) Permisos: el vendedor no unifica.
if (vendedor) await req(`/api/customers/${encodeURIComponent(principal.id)}/merge?with=${encodeURIComponent(duplicado.id)}`, 'GET', undefined, 403, vendedor)
await req(`/api/customers/${encodeURIComponent(principal.id)}/merge`, 'POST', { duplicateId: duplicado.id }, 403, vendedor)

// 5) Merge: la principal manda; el duplicado queda archivado con puntero.
const merge = await req(`/api/customers/${encodeURIComponent(principal.id)}/merge`, 'POST', { duplicateId: duplicado.id, principalId: principal.id })
assert.equal(merge.ok, true)
assert.equal(merge.movidos.orders, 1)
const tras = await req(`/api/customers/${encodeURIComponent(principal.id)}`)
assert.equal(tras.orders.some((orden) => orden.orderNumber === `MERGE-${sufijo}`), true, 'el pedido viajó a la principal')
assert.equal(tras.customer.email, `dup-${sufijo.toLowerCase()}@ejemplo.com`, 'el correo vacío se completó')
assert.deepEqual((tras.customer.tags || []).sort(), ['whatsapp'], 'las etiquetas se unieron')
assert.equal(tras.customer.creditLimitPyg, 500000, 'el crédito se completó')
const archivado = await req(`/api/customers/${encodeURIComponent(duplicado.id)}`)
assert.ok(archivado.customer.archivedAt, 'el duplicado quedó archivado')
assert.equal(archivado.customer.mergedIntoId, principal.id, 'el duplicado apunta a la principal')
const nota = tras.notes
assert.ok((nota || []).some((fila) => /Nota del duplicado/.test(fila.content || '')), 'las notas viajaron')

// 6) El listado excluye al archivado; la búsqueda de duplicados lo ignora.
const listado = await req(`/api/customers?q=${encodeURIComponent(`Duplicado ${sufijo}`)}`)
assert.equal((Array.isArray(listado) ? listado : []).some((fila) => fila.id === duplicado.id), false, 'el archivado no aparece en el listado')
const conArchivados = await req(`/api/customers?archivados=1&q=${encodeURIComponent(`Duplicado ${sufijo}`)}`)
assert.equal((Array.isArray(conArchivados) ? conArchivados : []).some((fila) => fila.id === duplicado.id), true, 'con ?archivados=1 se puede ver')
const duplicados = await req(`/api/customers/duplicates?phone=${encodeURIComponent(telefono)}`)
assert.equal(duplicados.duplicados.some((fila) => fila.id === principal.id), true, 'la detección encuentra la ficha activa')
assert.equal(duplicados.duplicados.some((fila) => fila.id === duplicado.id), false, 'la detección ignora las archivadas')

// 7) El enlace de portal del duplicado sigue vivo y ahora muestra a la principal.
if (token.token) {
  const portal = await publico(`/api/portal/${encodeURIComponent(token.token)}`)
  assert.equal(portal.status, 200, 'el token del duplicado sigue resolviendo')
  assert.equal(portal.data.customer.name, principal.name, 'el token muestra a la ficha principal')
}

// 8) Auditoría y cronología en las dos fichas.
const auditoria = await req('/api/audit?q=CUSTOMER_MERGED&limit=50')
assert.ok(auditoria.some((fila) => fila.action === 'CUSTOMER_MERGED' && fila.entityId === principal.id), 'el merge queda auditado')
const cronoPrincipal = await req(`/api/customers/${encodeURIComponent(principal.id)}/timeline?limit=50`)
const eventoMerge = cronoPrincipal.events.find((evento) => evento.action === 'CUSTOMER_MERGED')
assert.ok(eventoMerge, 'la principal registra el merge en su cronología')
assert.equal(eventoMerge.label, 'Cliente unificado')
assert.match(eventoMerge.detail, new RegExp(`Duplicado ${sufijo}`))
const cronoDuplicado = await req(`/api/customers/${encodeURIComponent(duplicado.id)}/timeline?limit=50`)
assert.ok(cronoDuplicado.events.some((evento) => evento.action === 'CUSTOMER_MERGED_INTO'), 'el duplicado registra su fusión')

// 9) Una ficha ya fusionada no se vuelve a unificar; validaciones.
await req(`/api/customers/${encodeURIComponent(principal.id)}/merge`, 'POST', { duplicateId: duplicado.id, principalId: principal.id }, 409)
await req(`/api/customers/${encodeURIComponent(principal.id)}/merge`, 'POST', { duplicateId: principal.id }, 400)
await req(`/api/customers/${encodeURIComponent(principal.id)}/merge`, 'POST', { duplicateId: duplicado.id }, 401, 'token-invalido')
assert.ok(garantia.id, 'la garantía del duplicado existía antes del merge')

console.log(`PASS: unificación de clientes con preview, puntero, auditoría y cronología · ${checks} chequeos`)
