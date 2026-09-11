#!/usr/bin/env node

// Pruebas funcionales de Cash, Purchases y Warranties.
// Uso: node backend/tests/new-modules-functional.mjs BASE_URL ADMIN_TOKEN [BRANCH_ID]

const [baseUrlArg, adminToken, branchId = 'branch-a-it'] = process.argv.slice(2)

if (!baseUrlArg || !adminToken) {
  console.error('Uso: node backend/tests/new-modules-functional.mjs BASE_URL ADMIN_TOKEN [BRANCH_ID]')
  process.exit(2)
}

const baseUrl = baseUrlArg.replace(/\/+$/, '')
const headersFor = () => ({ Authorization: 'Bearer ' + adminToken })

async function request(path, options = {}) {
  const headers = { ...headersFor(), ...(options.headers || {}) }
  const init = { ...options, headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  return fetch(baseUrl + path, init)
}

async function expectStatus(name, response, expected) {
  if (response.status !== expected) {
    const text = await response.text()
    throw new Error(name + ': esperado HTTP ' + expected + ', recibido ' + response.status + '. ' + text.slice(0, 240))
  }
}

async function json(response, name) {
  try {
    return await response.json()
  } catch {
    throw new Error(name + ': respuesta no JSON')
  }
}

function valueFromProducts(rows, productId) {
  const product = Array.isArray(rows) ? rows.find((row) => row.id === productId) : null
  if (!product) throw new Error('No se encontró el producto sintético en stock.')
  return Number(product.stock)
}

async function testPurchases() {
  const sku = 'SYNTH-FUNCTIONAL-' + Date.now()
  const createdProductResponse = await request('/api/products', {
    method: 'POST',
    body: { sku, name: 'Synthetic Functional Purchase Product', pricePyg: 1, stock: 0 },
  })
  await expectStatus('crear producto sintético para compra', createdProductResponse, 201)
  const product = await json(createdProductResponse, 'crear producto sintético para compra')

  const beforeResponse = await request('/api/stock')
  await expectStatus('stock antes de recibir compra', beforeResponse, 200)
  const before = valueFromProducts(await json(beforeResponse, 'stock antes de recibir compra'), product.id)
  if (before !== 0) throw new Error('El producto sintético no inició con stock cero.')

  const purchaseResponse = await request('/api/purchases', {
    method: 'POST',
    body: {
      supplierName: 'Synthetic Supplier',
      branchId,
      shippingPyg: 0,
      customsPyg: 0,
      lines: [{ productId: product.id, quantity: 3, unitCostPyg: 1000 }],
    },
  })
  await expectStatus('crear compra DRAFT', purchaseResponse, 201)
  const purchase = await json(purchaseResponse, 'crear compra DRAFT')
  if (purchase.status !== 'DRAFT' || purchase.lines?.length !== 1) throw new Error('La compra no quedó en DRAFT con su línea.')

  const receivedResponse = await request('/api/purchases', {
    method: 'PATCH',
    body: { id: purchase.id, action: 'receive' },
  })
  await expectStatus('recibir compra', receivedResponse, 200)
  const received = await json(receivedResponse, 'recibir compra')
  if (received.status !== 'RECEIVED') throw new Error('La compra no quedó RECEIVED.')

  const retryResponse = await request('/api/purchases', {
    method: 'PATCH',
    body: { id: purchase.id, action: 'receive' },
  })
  await expectStatus('reintentar recepción de compra', retryResponse, 409)

  const afterResponse = await request('/api/stock')
  await expectStatus('stock después de reintento de recepción', afterResponse, 200)
  const after = valueFromProducts(await json(afterResponse, 'stock después de reintento de recepción'), product.id)
  if (after !== 3) throw new Error('La recepción o el reintento alteró stock; esperado 3, recibido ' + after + '.')
  return 5
}

async function testCash() {
  const query = '?branchId=' + encodeURIComponent(branchId)
  const openedResponse = await request('/api/cash' + query, {
    method: 'POST',
    body: { action: 'open', openingPyg: 0, notes: 'Synthetic functional cash test' },
  })
  await expectStatus('abrir caja', openedResponse, 201)
  const opened = await json(openedResponse, 'abrir caja')
  if (opened.status !== 'OPEN') throw new Error('La caja no quedó OPEN.')

  const currentResponse = await request('/api/cash' + query)
  await expectStatus('consultar caja abierta', currentResponse, 200)
  const current = await json(currentResponse, 'consultar caja abierta')
  if (current?.status !== 'OPEN') throw new Error('La consulta no devolvió la caja abierta.')

  const closedResponse = await request('/api/cash' + query, {
    method: 'POST',
    body: { action: 'close', countedPyg: 0, notes: 'Synthetic functional cash close' },
  })
  await expectStatus('cerrar caja', closedResponse, 200)
  const closed = await json(closedResponse, 'cerrar caja')
  if (closed.status !== 'CLOSED') throw new Error('La caja no quedó CLOSED.')

  const retryResponse = await request('/api/cash' + query, {
    method: 'POST',
    body: { action: 'close', countedPyg: 0 },
  })
  await expectStatus('reintentar cierre de caja', retryResponse, 409)
  return 4
}

async function testWarranties() {
  const serial = 'SYNTH-WARRANTY-' + Date.now()
  const createdResponse = await request('/api/warranties', {
    method: 'POST',
    body: {
      customerName: 'Synthetic Customer',
      serial,
      description: 'Synthetic functional warranty issue',
      responsibleName: 'Synthetic QA',
      branchId,
    },
  })
  await expectStatus('crear garantía', createdResponse, 201)
  const created = await json(createdResponse, 'crear garantía')
  if (!created.id || created.status !== 'RECEIVED') throw new Error('La garantía no inició en RECEIVED.')

  const skippedResponse = await request('/api/warranties', {
    method: 'PATCH',
    body: { id: created.id, status: 'READY' },
  })
  await expectStatus('rechazar salto de transición de garantía', skippedResponse, 409)

  for (const status of ['DIAGNOSIS', 'READY', 'DELIVERED']) {
    const response = await request('/api/warranties', {
      method: 'PATCH',
      body: { id: created.id, status },
    })
    await expectStatus('transición de garantía a ' + status, response, 200)
    const row = await json(response, 'transición de garantía a ' + status)
    if (row.status !== status) throw new Error('La garantía no quedó en ' + status + '.')
  }
  return 5
}

async function main() {
  const purchaseChecks = await testPurchases()
  const cashChecks = await testCash()
  const warrantyChecks = await testWarranties()
  console.log('new-modules-functional: ' + (purchaseChecks + cashChecks + warrantyChecks) + ' checks OK (purchase receive/retry stock, cash open/close/retry, warranty transitions).')
}

main().catch((error) => {
  console.error('new-modules-functional: FALLÓ - ' + (error instanceof Error ? error.message : String(error)))
  process.exit(1)
})
