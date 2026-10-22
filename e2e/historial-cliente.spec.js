// Historiales de las fichas en cuenta real: el cliente muestra cada tipo de
// historial (compras con productos/IMEI, pagos, saldo, cotizaciones, mensajes,
// notas y datos) con filtros por tipo y período, y cada pedido abre su detalle;
// la unidad por IMEI muestra compra, venta y margen. Sin sesión no hay acceso.
import { test, expect, request as pwRequest } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: API, path, options })
}

test('ficha de cliente: cada historial, filtros por tipo y período, y apertura del pedido', async ({ page }) => {
  const marca = Date.now().toString(36).toUpperCase()
  await page.goto('/clientes')

  const cliente = await api(page, '/api/customers', {
    method: 'POST',
    body: JSON.stringify({ firstName: 'Historial', secondName: `QA ${marca}`, phone: `0982${String(Date.now()).slice(-6)}`, countryCode: '+595', document: `HI-${marca}`, email: `historial.${marca.toLowerCase()}@correo.com.py` }),
  })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)
  const clienteId = cliente.body.id
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ name: `Producto historial ${marca}`, sku: `HIS-${marca}`, pricePyg: 2000000, stock: 5 }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const ids = []
  for (const [numero, total, pago] of [['HIS-1', 2000000, 500000], ['HIS-2', 1000000, 1000000]]) {
    const pedido = await api(page, '/api/orders', {
      method: 'POST',
      body: JSON.stringify({ orderNumber: `${numero}-${marca}`, customerId: clienteId, items: [{ productId: producto.body.id, description: producto.body.name, quantity: 1, unitPricePyg: total }], payment: { method: 'CASH', amountPyg: pago } }),
    })
    expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)
    ids.push(pedido.body.id)
  }
  const cotizacion = await api(page, '/api/quotes', { method: 'POST', body: JSON.stringify({ customerId: clienteId, customerName: `Historial QA ${marca}`, items: [{ description: 'Equipo cotizado', quantity: 1, unitPricePyg: 3000000 }] }) })
  expect(cotizacion.status, JSON.stringify(cotizacion.body)).toBe(201)
  const nota = await api(page, `/api/customers/${clienteId}/notes`, { method: 'POST', body: JSON.stringify({ content: `Nota de historial ${marca}` }) })
  expect([200, 201], JSON.stringify(nota.body)).toContain(nota.status)

  // API: el contrato del historial (totales, grupos, período, paginado, accesos).
  const todo = await api(page, `/api/customers/${clienteId}/timeline?limit=100`)
  expect(todo.status).toBe(200)
  expect(todo.body.summary).toMatchObject({ pedidos: 2, gastadoPyg: 3000000, ticketPromedioPyg: 1500000, pendientePyg: 1500000 })
  const grupos = new Set(todo.body.events.map((evento) => evento.group))
  for (const grupo of ['compras', 'pagos', 'cotizaciones', 'notas', 'datos']) expect(grupos.has(grupo), `falta el grupo ${grupo}`).toBe(true)
  const pedidoEvento = todo.body.events.find((evento) => evento.type === 'order')
  expect(pedidoEvento.items[0]).toMatchObject({ quantity: 1 })
  expect(pedidoEvento.ref).toMatchObject({ kind: 'order' })
  expect(ids).toContain(pedidoEvento.ref.id)
  const soloCotizaciones = await api(page, `/api/customers/${clienteId}/timeline?grupos=cotizaciones`)
  expect(soloCotizaciones.body.events.length).toBeGreaterThan(0)
  expect(soloCotizaciones.body.events.every((evento) => evento.group === 'cotizaciones')).toBe(true)
  const futuro = await api(page, `/api/customers/${clienteId}/timeline?desde=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)
  expect(futuro.body.events).toHaveLength(0)
  const pagina = await api(page, `/api/customers/${clienteId}/timeline?limit=2`)
  expect(pagina.body.events).toHaveLength(2)
  expect(pagina.body.nextCursor).toBeTruthy()
  expect(pagina.body.summary).toBeTruthy()
  const siguiente = await api(page, `/api/customers/${clienteId}/timeline?limit=2&cursor=${encodeURIComponent(pagina.body.nextCursor)}`)
  expect(siguiente.body.summary).toBeUndefined()
  expect(siguiente.body.events.every((evento) => !pagina.body.events.some((previo) => previo.id === evento.id))).toBe(true)
  expect((await api(page, '/api/customers/no-existe-historial/timeline')).status).toBe(404)
  const anonimo = await pwRequest.newContext()
  expect((await anonimo.get(`${API}/api/customers/${clienteId}/timeline`)).status()).toBe(401)
  await anonimo.dispose()

  // Ficha: pestaña Cronología con totales, filtros y apertura del pedido.
  await page.getByLabel('Buscar clientes').fill(marca)
  await page.getByTestId('cliente-fila').filter({ hasText: marca }).first().click()
  const ficha = page.getByRole('dialog')
  await ficha.getByRole('tab', { name: /^Cronología/ }).click()
  await expect(ficha.getByTestId('perfil-historial-resumen')).toContainText('Gs 3.000.000')
  await expect(ficha.getByTestId('perfil-historial-resumen')).toContainText('Gs 1.500.000')
  await expect(ficha.getByTestId('historial-evento').first()).toBeVisible()

  await ficha.getByTestId('historial-grupo-cotizaciones').click()
  await expect(ficha.getByTestId('historial-evento').first()).toBeVisible()
  await expect(ficha.getByTestId('historial-evento').first()).toHaveAttribute('data-grupo', 'cotizaciones')
  expect(await ficha.getByTestId('historial-evento').evaluateAll((nodos) => nodos.every((nodo) => nodo.dataset.grupo === 'cotizaciones'))).toBe(true)

  await ficha.getByTestId('historial-grupo-compras').click()
  const compra = ficha.getByTestId('historial-evento').filter({ hasText: `HIS-1-${marca}` }).first()
  await expect(compra).toBeVisible()
  await compra.getByTestId('historial-ver-productos').click()
  await expect(compra.getByTestId('historial-productos')).toContainText(`Producto historial ${marca}`)

  await ficha.getByTestId('historial-periodo').selectOption('30')
  await expect(ficha.getByTestId('historial-evento').first()).toBeVisible()

  await compra.getByTestId('historial-abrir-pedido').click()
  await expect(page).toHaveURL(/\/pedidos\/[^/]+$/)
})

test('unidad por IMEI: compra con proveedor y costo, venta con cliente y margen', async ({ page }) => {
  const marca = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase()
  await page.goto('/productos')
  const producto = await api(page, '/api/products', { method: 'POST', body: JSON.stringify({ sku: `KX-${marca}`, name: `Equipo kardex ${marca}`, category: 'Celulares', pricePyg: 3000000, costPyg: 2000000, stock: 0, branchId: SEED.branchId }) })
  expect(producto.status, JSON.stringify(producto.body)).toBe(201)
  const compra = await api(page, '/api/purchases', { method: 'POST', body: JSON.stringify({ supplierName: `Proveedor IMEI ${marca}`, branchId: SEED.branchId, lines: [{ productId: producto.body.id, quantity: 1, unitCostPyg: 2000000 }] }) })
  expect(compra.status, JSON.stringify(compra.body)).toBe(201)
  const serial = `35${String(Date.now()).slice(-13)}`
  const unidad = await api(page, '/api/inventory-units', { method: 'POST', body: JSON.stringify({ productId: producto.body.id, serial, branchId: SEED.branchId, costPyg: 2000000, supplierName: `Proveedor IMEI ${marca}` }) })
  expect(unidad.status, JSON.stringify(unidad.body)).toBe(201)
  const cliente = await api(page, '/api/customers', { method: 'POST', body: JSON.stringify({ name: `Cliente IMEI ${marca}`, phone: `0983${String(Date.now()).slice(-6)}`, countryCode: '+595' }) })
  expect(cliente.status, JSON.stringify(cliente.body)).toBe(201)
  const pedido = await api(page, '/api/orders', { method: 'POST', body: JSON.stringify({ orderNumber: `IMEI-${marca}`, customerId: cliente.body.id, items: [{ productId: producto.body.id, description: producto.body.name, quantity: 1, unitPricePyg: 3000000, inventoryUnitSerials: [serial] }], payment: { method: 'CASH', amountPyg: 3000000 } }) })
  expect(pedido.status, JSON.stringify(pedido.body)).toBe(201)

  const historia = await api(page, `/api/inventory-units/${unidad.body.id}/history`)
  expect(historia.status, JSON.stringify(historia.body)).toBe(200)
  const tipos = historia.body.events.map((evento) => evento.type)
  expect(tipos).toContain('purchase')
  expect(tipos).toContain('sale')
  const venta = historia.body.events.find((evento) => evento.type === 'sale')
  expect(venta.detail).toContain(`Cliente IMEI ${marca}`)
  expect(historia.body.margen.ventaPyg).toBe(3000000)
  expect(historia.body.margen.costPyg).toBeGreaterThan(0)
  expect(historia.body.margen.margenPyg).toBe(historia.body.margen.ventaPyg - historia.body.margen.costPyg)
  // La respuesta no expone los campos extra de compra/reserva de la unidad.
  expect(historia.body.unit).not.toHaveProperty('costPyg')

  const anonimo = await pwRequest.newContext()
  expect((await anonimo.get(`${API}/api/inventory-units/${unidad.body.id}/history`)).status()).toBe(401)
  await anonimo.dispose()
})
