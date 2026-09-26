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

// 6) Motor automático (#250 F1): venta sobre pedido sin stock → la necesidad
// nace sola, con el pedido vinculado y la fecha prometida como prioridad.
const productoAuto = await req('/api/products', 'POST', { name: `Auto ${sufijo}`, sku: `AUTO-${sufijo}`, pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: rama, reorderPoint: 3 }, 201)
const prometida = new Date(Date.now() + 36 * 3600000).toISOString()
const cuerpoPedido = {
  orderNumber: `AUTO-${sufijo}`,
  promisedAt: prometida,
  items: [{ productId: productoAuto.id, description: 'Auto', quantity: 2, unitPricePyg: 1000000, backorder: true }],
  payments: [],
}
const claveOperacion = `auto-${sufijo}-operacion`.toLowerCase()
const pedido = await (async () => {
  const respuesta = await fetch(`${base}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json', 'Idempotency-Key': claveOperacion }, body: JSON.stringify(cuerpoPedido) })
  const datos = await respuesta.json().catch(() => null)
  assert.equal(respuesta.status, 201, `POST /api/orders: ${JSON.stringify(datos)}`)
  checks++
  return datos
})()
const panelAuto = await req(`/api/supply/needs?productId=${productoAuto.id}`)
const grupoAuto = panelAuto.grupos.find((grupo) => grupo.productoId === productoAuto.id)
assert.ok(grupoAuto, 'la venta sin stock generó la necesidad automática')
const necesidadAuto = grupoAuto.necesidades.length
assert.ok(necesidadAuto >= 1, 'hay al menos una necesidad para el producto')
const destinos = grupoAuto.destinos || []
const destinoPedido = destinos.find((destino) => destino.tipo === 'PEDIDO')
const destinoStock = destinos.find((destino) => destino.tipo === 'STOCK')
assert.ok(destinoPedido, 'el pedido conserva su destino')
assert.equal(destinoPedido.cantidad, 2, 'la cantidad es lo que quedó sin cubrir')
assert.equal(destinoPedido.pedidoNumero, `AUTO-${sufijo}`, 'queda vinculado al pedido')
assert.ok(destinoStock, 'el bajo mínimo convive como destino de reposición')
assert.ok(grupoAuto.origenes.includes('ORDER_COMMITTED'), 'la venta sin stock con fecha es ORDER_COMMITTED')
assert.ok(grupoAuto.origenes.includes('BELOW_REORDER'), 'y la reposición por mínimo está en el mismo grupo')
assert.equal(grupoAuto.prioridad, 'ALTA', 'la promesa a 36 h manda la prioridad')

// Repetir el evento (mismo pedido idempotente) no duplica la necesidad.
const repetido = await (async () => {
  const respuesta = await fetch(`${base}/api/orders`, { method: 'POST', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json', 'Idempotency-Key': claveOperacion }, body: JSON.stringify(cuerpoPedido) })
  const datos = await respuesta.json().catch(() => null)
  assert.equal(respuesta.status, 200, `reintento idempotente: ${JSON.stringify(datos)}`)
  checks++
  return datos
})()
assert.equal(repetido.id, pedido.id, 'el pedido idempotente se reutiliza')
const panelRepetido = await req(`/api/supply/needs?productId=${productoAuto.id}`)
assert.equal(panelRepetido.grupos[0].necesidades.length, necesidadAuto, 'no se duplica la necesidad')

// Asignación de comprador/origen: en bloque para un grupo consolidado, y de a
// una; los centros no se mezclan en la consolidación y se pueden liberar.
const [necesidadPedido, necesidadMinimo] = grupoAuto.necesidades
const enBloque = await req('/api/supply/needs', 'PATCH', { ids: grupoAuto.necesidades, action: 'assign', assignedToId: compradorId, origin: 'usa' })
assert.equal(enBloque.actualizadas, grupoAuto.necesidades.length, 'asigna el grupo entero')
const porOrigen = await req('/api/supply/needs?origin=USA')
const grupoUsa = porOrigen.grupos.find((grupo) => grupo.productoId === productoAuto.id)
assert.ok(grupoUsa, 'el filtro por centro devuelve la necesidad')
assert.equal(grupoUsa.centro, 'USA', 'el grupo expone su centro')
assert.equal(grupoUsa.destinos.length, 2, 'los destinos siguen conservados')
assert.equal(grupoUsa.destinos[0].tipo, 'PEDIDO', 'el pedido va primero')

// Liberar una necesidad: vuelve a la cola sin centro y el grupo se separa.
const liberada = await req('/api/supply/needs', 'PATCH', { id: necesidadMinimo, action: 'assign', assignedToId: null, origin: null })
assert.equal(liberada.assignedToId, null)
assert.equal(liberada.origin, null)
assert.equal(liberada.status, 'ABIERTA', 'sin comprador vuelve a la cola')
const separados = (await req(`/api/supply/needs?productId=${productoAuto.id}`)).grupos.filter((grupo) => grupo.productoId === productoAuto.id)
assert.equal(separados.length, 2, 'USA y sin centro no se consolidan juntos')
assert.ok(separados.some((grupo) => grupo.centro === 'USA') && separados.some((grupo) => grupo.centro === null))
const sinCentro = await req(`/api/supply/needs?productId=${productoAuto.id}&sinCentro=1`)
assert.equal(sinCentro.grupos.length, 1, 'el filtro sinCentro deja solo la que no tiene centro')
const sinAsignar = await req(`/api/supply/needs?productId=${productoAuto.id}&sinAsignar=1`)
assert.equal(sinAsignar.grupos.length, 1, 'el filtro sinAsignar deja solo la liberada')

// Reasignar la liberada a otro centro: dos grupos, cada uno con su comprador.
const aCde = await req('/api/supply/needs', 'PATCH', { id: necesidadMinimo, action: 'assign', origin: 'CDE' })
assert.equal(aCde.origin, 'CDE')
const cde = (await req(`/api/supply/needs?productId=${productoAuto.id}&origin=CDE`)).grupos.find((grupo) => grupo.productoId === productoAuto.id)
assert.ok(cde && cde.centro === 'CDE' && cde.cantidad === 4, `el mínimo queda en CDE con su cantidad: ${JSON.stringify(cde)}`)
await req('/api/supply/needs', 'PATCH', { id: necesidadPedido, action: 'assign', origin: 'C' }, 400)
await req('/api/supply/needs', 'PATCH', { ids: [], action: 'assign', origin: 'USA' }, 400)

// Venta con stock que cae bajo el punto de reposición → BELOW_REORDER sola.
const productoMinimo = await req('/api/products', 'POST', { name: `Mínimo ${sufijo}`, sku: `MIN-${sufijo}`, pricePyg: 500000, costPyg: 300000, stock: 2, branchId: rama, reorderPoint: 3 }, 201)
await req('/api/orders', 'POST', { orderNumber: `MIN-${sufijo}`, items: [{ productId: productoMinimo.id, description: 'Mínimo', quantity: 1, unitPricePyg: 500000 }], payments: [{ method: 'CASH', amountPyg: 500000, status: 'CONFIRMED' }] }, 201)
const panelMinimo = await req(`/api/supply/needs?productId=${productoMinimo.id}`)
const grupoMinimo = panelMinimo.grupos.find((grupo) => grupo.productoId === productoMinimo.id)
assert.ok(grupoMinimo, 'la caída bajo el mínimo generó la reposición automática')
assert.equal(grupoMinimo.origenes[0], 'BELOW_REORDER')

// Reserva/backorder sin unidad: se reserva lo existente y falta la diferencia.
const serialReserva = `356790${String(Date.now()).slice(-9)}`
const productoReserva = await req('/api/products', 'POST', { name: `Reserva auto ${sufijo}`, sku: `RESA-${sufijo}`, pricePyg: 800000, costPyg: 500000, stock: 1, branchId: rama, imei: serialReserva }, 201)
const reserva = await req('/api/inventory-reservations', 'POST', { serials: [serialReserva], productId: productoReserva.id, quantity: 3, minutes: 60, customerName: 'Cliente reserva auto' }, 201)
assert.equal(Array.isArray(reserva) ? reserva.length : 0, 1, 'se reservó la unidad existente')
const panelReserva = await req(`/api/supply/needs?productId=${productoReserva.id}`)
const grupoReserva = panelReserva.grupos.find((grupo) => grupo.productoId === productoReserva.id)
assert.ok(grupoReserva, 'la reserva sin unidad generó la necesidad')
assert.equal(grupoReserva.cantidad, 2, 'solo la diferencia faltante')
assert.equal(grupoReserva.origenes[0], 'RESERVATION_NO_STOCK')

// 7) Prioridades y fechas desde el panel: PATCH update de a una o en bloque.
const porFecha = await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update', promisedAt: new Date(Date.now() - 3600000).toISOString() })
assert.equal(porFecha.priority, 'URGENTE', 'una fecha vencida recalcula la prioridad')
const conVencida = await req('/api/supply/needs')
assert.ok(conVencida.contadores.vencidas >= 1, 'la fecha vencida cuenta en los contadores')
const forzada = await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update', priority: 'BAJA' })
assert.equal(forzada.priority, 'BAJA', 'la prioridad explícita manda')
await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update', priority: 'YA' }, 400)
await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update' }, 400)
await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update', promisedAt: 'ayer' }, 400)
const enBloquePrioridad = await req('/api/supply/needs', 'PATCH', { ids: [reposicion.id, urgente.id], action: 'update', priority: 'ALTA' })
assert.equal(enBloquePrioridad.actualizadas, 2, 'la prioridad se ajusta en bloque')
const limpiada = await req('/api/supply/needs', 'PATCH', { id: reposicion.id, action: 'update', promisedAt: null })
assert.equal(limpiada.promisedAt, null, 'la fecha prometida se puede limpiar')

// 8) Contadores para las pestañas y filtros de prioridad/condición.
const panel = await req('/api/supply/needs')
assert.ok(panel.contadores, 'el panel recibe los contadores')
assert.ok(panel.contadores.pendientes >= 1, 'hay pendientes contadas')
assert.ok(panel.contadores.porEstado.ABIERTA >= 1 && panel.contadores.porEstado.ASIGNADA >= 1)
assert.ok(panel.contadores.porPrioridad.ALTA >= 2, 'las dos en bloque quedaron ALTA')
assert.ok(panel.contadores.sinAsignar >= 1 && panel.contadores.sinCentro >= 1)
const soloAltas = await req('/api/supply/needs?priority=ALTA')
assert.ok(soloAltas.grupos.length >= 1 && soloAltas.grupos.every((grupo) => grupo.prioridad === 'ALTA'), 'el filtro por prioridad no mezcla')
const soloUsadas = await req('/api/supply/needs?condition=USED')
assert.ok(soloUsadas.grupos.every((grupo) => grupo.condicion === 'USED'))

// 9) Opciones del panel: compradores, centros y sucursales.
const opciones = await req('/api/supply/needs/options')
assert.ok(opciones.compradores.some((persona) => persona.id === compradorId), 'el comprador asignable aparece')
assert.ok(opciones.compradores.every((persona) => persona.name), 'los compradores vienen con nombre')
assert.ok(opciones.centros.some((centro) => centro.centro === 'CDE') && opciones.centros.some((centro) => centro.centro === 'USA'), 'los centros del plan están')
assert.ok(Array.isArray(opciones.sucursales), 'las sucursales están disponibles')
if (vendedor) await req('/api/supply/needs/options', 'GET', undefined, 403, vendedor)
else await req('/api/supply/needs/options', 'GET', undefined, 401, 'token-invalido')

console.log(`PASS: necesidades manuales + motor automático + consolidación por centro + prioridad/fecha + opciones del panel + asignación/cancelación auditadas · ${checks} chequeos`)
