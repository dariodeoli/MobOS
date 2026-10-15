// Finanzas → Conciliación (#199): ingresos por cuenta/procesadora, lote de un
// depósito contra los pagos que cubre, diferencia con observación y
// trazabilidad hasta el pedido, contra datos reales del arnés.
import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function crearCuentaYPago(page, { sufijo, kind, processor, amount }) {
  return page.evaluate(async ({ api, sufijo, kind, processor, amount }) => {
    const post = async (path, body) => {
      const respuesta = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: respuesta.status, data: await respuesta.json().catch(() => null) }
    }
    // Producto propio del test: no depende del stock que dejen otras specs.
    const producto = await post('/api/products', { name: `QA Conciliación ${sufijo}`, sku: `QA-CONC-${sufijo}`, pricePyg: amount, stock: 5 })
    const cuenta = await post('/api/payment-accounts', {
      name: `QA Conciliación ${kind} ${sufijo}`,
      kind,
      currency: 'PYG',
      ...(kind === 'TRANSFER' ? { bank: 'Banco QA', holder: 'Titular QA', accountNumber: `QA-${sufijo}` } : {}),
      ...(processor ? { processor } : {}),
    })
    const orden = await post('/api/orders', {
      items: [{ productId: producto.data.id, description: producto.data.name, quantity: 1, unitPricePyg: producto.data.pricePyg }],
      payments: [{ accountId: cuenta.data.id, originalAmount: String(amount), exchangeRatePyg: '1', amountPyg: amount, method: kind, status: 'CONFIRMED', reference: `CONC-${sufijo}` }],
    })
    return { cuenta: cuenta.data, orden: orden.data, status: orden.status, cuentaStatus: cuenta.status, productoStatus: producto.status }
  }, { api: API, sufijo, kind, processor, amount })
}

test.describe('finanzas · conciliación', () => {
  test('ingresos por procesadora y lote con diferencia y trazabilidad', async ({ page }) => {
    // Primero una página de la app: el fetch con cookies sale del mismo origen.
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const pago = await crearCuentaYPago(page, { sufijo, kind: 'CARD', processor: 'Bancard', amount: 250000 })
    expect(pago.status).toBe(201)
    const numero = pago.orden.orderNumber.replace('#', '') // #461: se muestra sin «#»

    await page.goto('/finanzas/conciliacion?rango=hoy')
    await expect(page.getByRole('heading', { name: 'Conciliación', exact: true })).toBeVisible()

    // Filtro por procesadora: aparece Bancard con el pago recién creado.
    await page.getByLabel('Procesadora').selectOption({ label: 'Bancard' })
    const fila = page.getByTestId('conciliacion-fila').filter({ hasText: numero })
    await expect(fila).toBeVisible()
    await expect(fila.getByText('Bancard')).toBeVisible()
    await expect(fila.getByText('Por conciliar')).toBeVisible()

    // Lote 6-C (#169): en desktop (1280) las tablas entran sin scroll horizontal.
    // Los grupos arrancan plegados: se abren para medir su tabla.
    const mostrar = page.getByRole('button', { name: /^Mostrar / })
    while (await mostrar.count()) await mostrar.first().click()
    for (const testid of ['conciliacion-grupos', 'conciliacion-tabla']) {
      const medida = await page.getByTestId(testid).evaluate((nodo) => ({ scrollWidth: nodo.scrollWidth, clientWidth: nodo.clientWidth }))
      expect(medida.scrollWidth, `${testid} no debe pedir scroll horizontal`).toBeLessThanOrEqual(medida.clientWidth + 1)
    }

    // Diferencia sin observación: el botón queda bloqueado.
    await fila.getByRole('checkbox').check()
    await page.getByLabel('Monto recibido').fill('240000')
    await expect(page.getByRole('button', { name: 'Conciliar lote' })).toBeDisabled()

    // Con observación: el lote queda "Con diferencia".
    await page.getByPlaceholder('Ej. la procesadora retuvo la comisión del lote').fill('Comisión de la procesadora')
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    await expect(page.getByText(/Lote conciliado/)).toBeVisible()
    await expect(page.getByTestId('conciliacion-lote').first().getByText('Con diferencia')).toBeVisible()
    await expect(page.getByTestId('conciliacion-lote').first().getByText('Comisión de la procesadora')).toBeVisible()
    await expect(fila.getByText('Conciliado')).toBeVisible()

    // Trazabilidad: "Ver pedido" abre el detalle con sus pagos.
    await fila.getByRole('button', { name: 'Ver pedido' }).click()
    await expect(page.getByText(`Pagos · ${numero}`)).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('un lote no puede mezclar cuentas', async ({ page }) => {
    await page.goto('/resumen')
    const sufijo = Date.now().toString(36).toUpperCase()
    const uno = await crearCuentaYPago(page, { sufijo: `${sufijo}A`, kind: 'TRANSFER', amount: 150000 })
    const dos = await crearCuentaYPago(page, { sufijo: `${sufijo}B`, kind: 'TRANSFER', amount: 160000 })
    expect(uno.status, JSON.stringify({ producto: uno.productoStatus, cuenta: uno.cuentaStatus, orden: uno.orden })).toBe(201)
    expect(dos.status, JSON.stringify({ producto: dos.productoStatus, cuenta: dos.cuentaStatus, orden: dos.orden })).toBe(201)

    await page.goto('/finanzas/conciliacion?rango=hoy')
    const filaUno = page.getByTestId('conciliacion-fila').filter({ hasText: uno.orden.orderNumber.replace('#', '') })
    const filaDos = page.getByTestId('conciliacion-fila').filter({ hasText: dos.orden.orderNumber.replace('#', '') })
    await expect(filaUno).toBeVisible()
    await expect(filaDos).toBeVisible()
    await filaUno.getByRole('checkbox').check()
    await filaDos.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Conciliar lote' }).click()
    // El servidor rechaza el lote mixto y el error queda visible.
    await expect(page.getByText(/misma cuenta/)).toBeVisible()
  })
})


test('día por sucursal: declaración independiente, idempotencia, concurrencia y corrección posterior', async ({ page }) => {
  await page.goto('/resumen')
  const created = await crearCuentaYPago(page, { sufijo: `DIA${Date.now().toString(36)}`, kind: 'CASH', processor: null, amount: 120000 })
  expect(created.status).toBe(201)
  const result = await page.evaluate(async ({ api, order }) => {
    const call = async (path, method = 'GET', body, key) => {
      const response = await fetch(api + path, { method, credentials: 'include', headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, data: await response.json() }
    }
    const day = new Date(Date.now() - 10800000).toISOString().slice(0, 10)
    const branchId = order.branchId
    const path = `/api/finance/reconciliation?view=day&day=${day}&branchId=${branchId}`
    const before = await call(path)
    const otherBranch = await call(`/api/finance/reconciliation?view=day&day=${day}&branchId=outside-tenant`)
    const declarations = before.data.groups.map(row => ({ method: row.method, accountId: row.accountId, currency: row.currency, receivedPyg: row.expectedPyg }))
    const body = { action: 'day', day, branchId, expectedVersion: before.data.version, requestId: crypto.randomUUID(), declarations }
    const wrongScope = await call(path, 'POST', { ...body, branchId: 'outside-tenant' })
    const missing = await call(path, 'POST', { ...body, declarations: [] })
    const difference = await call(path, 'POST', { ...body, requestId: crypto.randomUUID(), declarations: declarations.map((row, index) => index ? row : { ...row, receivedPyg: row.receivedPyg + 1000 }) })
    const [first, replay] = await Promise.all([call(path, 'POST', body), call(path, 'POST', body)])
    const changedKey = await call(path, 'POST', { ...body, note: 'No es el mismo pedido' })
    const concurrentBody = { ...body, expectedVersion: first.data.version, note: 'Revisión del conteo' }
    const concurrent = await Promise.all([call(path, 'POST', { ...concurrentBody, requestId: crypto.randomUUID() }), call(path, 'POST', { ...concurrentBody, requestId: crypto.randomUUID() })])
    const afterDeclaration = await call(`/api/orders/${order.id}`)
    const accountResponse = await call('/api/payment-accounts', 'POST', { name: `Transferencia día ${Date.now()}`, kind: 'TRANSFER', currency: 'PYG', bank: 'Banco ficticio QA', holder: 'Comercio QA', accountNumber: 'QA-DIA' })
    const original = afterDeclaration.data.payments.find(row => row.method === 'CASH' && row.amountPyg === 120000)
    const correction = await call(`/api/orders/${order.id}/payments/${original.id}/correction`, 'POST', { reason: 'El cliente transfirió en vez de efectivo', payments: [{ accountId: accountResponse.data.id, amount: 120000 }] }, crypto.randomUUID())
    const afterCorrection = await call(path)
    const orderAfter = await call(`/api/orders/${order.id}`)
    return { before, otherBranch, wrongScope, missing, difference, first, replay, changedKey, concurrent, afterDeclaration, afterCorrection, correction, orderAfter }
  }, { api: API, order: created.orden })
  expect(result.before.status).toBe(200)
  expect(result.otherBranch.status).toBe(403)
  expect(result.wrongScope.status).toBe(403)
  expect(result.missing.status).toBe(400)
  expect(result.difference.status).toBe(400)
  expect(result.first.status).toBe(200); expect(result.replay.status).toBe(200)
  expect(result.first.data.state).toBe('VERIFIED')
  expect(result.first.data.version).toBe(result.before.data.version + 1)
  expect(result.replay.data.version).toBe(result.first.data.version)
  expect(result.changedKey.status).toBe(409)
  expect(result.concurrent.map(row => row.status).sort()).toEqual([200, 409])
  expect(result.afterDeclaration.data.payments).toHaveLength(created.orden.payments.length)
  expect(result.correction.status).toBe(201)
  expect(result.afterCorrection.data.expectedPyg).toBe(result.first.data.expectedPyg)
  expect(result.afterCorrection.data.changedSinceDeclaration).toBe(true)
  expect(result.afterCorrection.data.state).toBe('DIFFERENCE')
  expect(result.afterCorrection.data.history.some(row => row.snapshot.state === 'VERIFIED')).toBe(true)
  expect(result.orderAfter.data.payments.filter(row => row.reversalOfId)).toHaveLength(1)
  // El diálogo toma el día y sucursal reales, conservando los lotes del período.
  await page.goto('/finanzas/conciliacion?rango=hoy')
  await page.getByRole('button', { name: 'Verificar día por sucursal' }).click()
  await expect(page.getByTestId('conciliacion-dia-estado')).toHaveText('Con diferencia')
})
