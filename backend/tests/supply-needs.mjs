import assert from 'node:assert/strict'

// #250 Fase 1 — API mínima «Por comprar» del Centro de Abastecimiento:
// carga manual de necesidades, consolidación por producto + condición
// conservando destinos, y asignación/cancelación auditadas. Corre contra el
// seed del arnés (base + token admin; el token de vendedor es opcional para el
// caso 403).
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
const rama2 = 'branch-a2-it'

// 1) Dos productos propios: las necesidades no crean stock, solo demanda.
const productoA = await req('/api/products', 'POST', { name: `Necesidad A ${sufijo}`, sku: `NEC-A-${sufijo}`, pricePyg: 2000000, costPyg: 1500000, stock: 0, branchId: rama }, 201)
const productoB = await req('/api/products', 'POST', { name: `Necesidad B ${sufijo}`, sku: `NEC-B-${sufijo}`, pricePyg: 500000, costPyg: 300000, stock: 2, branchId: rama }, 201)
const productoC = await req('/api/products', 'POST', { name: `Necesidad C ${sufijo}`, sku: `NEC-C-${sufijo}`, pricePyg: 1200000, costPyg: 800000, stock: 0, branchId: rama }, 201)

// 2) Carga manual: misma variante (NEW) para dos sucursales y otra condición.
const reposicion = await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 1, branchId: rama, priority: 'NORMAL', notes: 'Reposición preventiva' }, 201)
assert.equal(reposicion.source, 'MANUAL')
assert.equal(reposicion.status, 'ABIERTA')
const urgente = await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 2, branchId: rama2, priority: 'URGENTE', promisedAt: '2026-10-01T10:00:00.000Z' }, 201)
const usada = await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 3, condition: 'USED' }, 201)
const otra = await req('/api/supply/needs', 'POST', { productId: productoB.id, quantity: 5 }, 201)
assert.equal(otra.priority, 'NORMAL', 'manual sin fecha queda normal (regla FIN #254)')

// FIN (#254): sin prioridad explícita, la fecha prometida manda.
const enDosDias = await req('/api/supply/needs', 'POST', { productId: productoC.id, quantity: 2, branchId: rama, promisedAt: new Date(Date.now() + 86400000).toISOString() }, 201)
assert.equal(enDosDias.priority, 'URGENTE', 'una promesa a un día escala la prioridad sola')
const vencida = await req('/api/supply/needs', 'POST', { productId: productoC.id, quantity: 1, branchId: rama, promisedAt: new Date(Date.now() - 86400000).toISOString() }, 201)
assert.equal(vencida.priority, 'URGENTE', 'una fecha vencida es urgente')
const manualUrgente = await req('/api/supply/needs', 'POST', { productId: productoC.id, quantity: 1, priority: 'BAJA' }, 201)
assert.equal(manualUrgente.priority, 'BAJA', 'la prioridad explícita se respeta')

// Validaciones de la carga manual.
await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 0 }, 400)
await req('/api/supply/needs', 'POST', { quantity: 1 }, 400)
await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 1, priority: 'YA' }, 400)
await req('/api/supply/needs', 'POST', { productId: 'no-existe', quantity: 1 }, 404)

// 3) Consolidación: agrupa por producto + condición y conserva los destinos.
const vista = await req('/api/supply/needs')
assert.ok(Array.isArray(vista.grupos) && vista.grupos.length >= 3, 'la vista devuelve los grupos')
const grupoNuevo = vista.grupos.find((grupo) => grupo.productoId === productoA.id && grupo.condicion === 'NEW')
assert.ok(grupoNuevo, 'el grupo NEW del producto A existe')
assert.equal(grupoNuevo.cantidad, 3, 'suma 1 (reposición) + 2 (sucursal 2)')
assert.equal(grupoNuevo.prioridad, 'URGENTE', 'deja la prioridad más alta')
assert.equal(grupoNuevo.prometidaEl, '2026-10-01T10:00:00.000Z', 'deja la fecha prometida más próxima')
assert.equal(grupoNuevo.destinos.length, 2, 'conserva los destinos sin mezclarlos')
assert.deepEqual(grupoNuevo.destinos.map((destino) => destino.cantidad).sort(), [1, 2])
assert.ok(grupoNuevo.destinos.every((destino) => destino.tipo === 'STOCK'), 'sin pedido son reposiciones')
const grupoUsado = vista.grupos.find((grupo) => grupo.productoId === productoA.id && grupo.condicion === 'USED')
assert.ok(grupoUsado && grupoUsado.cantidad === 3, 'la condición USED no se mezcla con NEW')
const grupoB = vista.grupos.find((grupo) => grupo.productoId === productoB.id)
assert.ok(grupoB && grupoB.cantidad === 5)

// FIN (#254): el grupo trae el costo estimado (costo × unidades) y, sin venta
// vinculada, el margen queda en null.
const grupoC = vista.grupos.find((grupo) => grupo.productoId === productoC.id)
assert.ok(grupoC, 'el grupo del producto C existe')
assert.equal(grupoC.cantidad, 4, '2 (a dos días) + 1 (vencida) + 1 (manual BAJA)')
assert.equal(grupoC.costoEstimadoPyg, 800000 * 4, 'el costo estimado suma el de las necesidades')
assert.equal(grupoC.margenEstimadoPyg, null, 'sin venta vinculada no hay margen')
assert.equal(grupoC.prioridad, 'URGENTE', 'la fecha vencida manda en el grupo')

// El filtro por producto aísla el grupo.
const filtrado = await req(`/api/supply/needs?productId=${productoB.id}`)
assert.equal(filtrado.grupos.length, 1)
assert.equal(filtrado.grupos[0].productoId, productoB.id)

// 4) Asignación y cancelación auditadas.
const yo = await req('/api/auth/me')
const compradorId = yo.user?.id || yo.id
const asignada = await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'assign', assignedToId: compradorId })
assert.equal(asignada.status, 'ASIGNADA')
assert.equal(asignada.assignedToId, compradorId)
await req('/api/supply/needs', 'PATCH', { id: urgente.id, action: 'cancel' }, 400, admin)
const cancelada = await req('/api/supply/needs', 'PATCH', { id: otra.id, action: 'cancel', reason: 'Duplicada en otra sucursal' })
assert.equal(cancelada.status, 'CANCELADA')
const vistaFinal = await req('/api/supply/needs')
assert.ok(!vistaFinal.grupos.some((grupo) => grupo.necesidades.includes(otra.id)), 'la cancelada sale del panel')
const canceladas = await req('/api/supply/needs?status=CANCELADA')
assert.ok(canceladas.grupos.some((grupo) => grupo.necesidades.includes(otra.id)), 'la cancelada se ve filtrando por estado')
await req('/api/supply/needs', 'PATCH', { id: usada.id, action: 'cancel', reason: 'x' }, 400)

// 5) Permisos: sin token 401, vendedor 403 (no modifica compras).
await req('/api/supply/needs', 'GET', undefined, 401, 'token-invalido')
if (vendedor) {
  await req('/api/supply/needs', 'GET', undefined, 403, vendedor)
  await req('/api/supply/needs', 'POST', { productId: productoA.id, quantity: 1 }, 403, vendedor)
}

console.log(`PASS: necesidades manuales + consolidación (${vista.grupos.length} grupos) + asignación/cancelación auditadas · ${checks} chequeos`)
