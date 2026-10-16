import { test, expect } from '@playwright/test'
import { openShellDestination, selectFinanceSection, selectAnalysisSection } from '../helpers/shell-navigation.js'
const gs = n => new Intl.NumberFormat('es-PY').format(n)
async function enter(page, role = 'Dueño') {
  const api = []
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/public/track') api.push(`${route.request().method()} ${url.pathname}`)
      return route.fulfill({ status: 503, json: { message: 'QA demo aislada: red bloqueada' } })
    }
    return url.protocol === 'https:' ? route.abort() : route.continue()
  })
  await page.addInitScript(() => { sessionStorage.setItem('mobos:demo-guia-vista', '1'); localStorage.setItem('mobos:aviso-metricas', '1') })
  await page.goto('/demo')
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Inicio')
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().length)).toBeGreaterThan(15)
  return () => expect(api, 'sin OwnData ni API privada en recorridos demo').toEqual([])
}
async function cart(page, items, pagos = []) {
  await page.evaluate(async ({ items, pagos }) => {
    const storage = await import('/src/lib/storage.js')
    const { guardarCarrito } = await import('/src/lib/posCart.js')
    const { listarClientesDemo } = await import('/src/lib/demoClientes.js')
    const { listDemoUnits, reserveDemoUnits } = await import('/src/lib/demoInventory.js')
    const customer = listarClientesDemo().find(row => row.name === 'Carlos Benítez')
    for (const item of items.filter(item => item.requiereSerie)) {
      const unit = listDemoUnits().find(unit => unit.productId === item.productoId && unit.status === 'AVAILABLE')
      if (!unit) throw new Error('Sin unidad disponible para QA')
      item.serials = [unit.serial]
      reserveDemoUnits({ serials: item.serials, customerId: customer.id, customerName: customer.name })
    }
    const c = storage.contextoActual()
    guardarCarrito(c.empresaId, c.sucursalId, c.userId, { items, customer, pagos })
  }, { items, pagos })
  await openShellDestination(page, 'Nueva venta')
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
}
async function finish(page) {
  await page.getByTestId('pos-cobro').locator('button[type=submit]').first().click()
  const partial = page.getByRole('button', { name: 'Marcar pago parcial', exact: true })
  if (await partial.isVisible()) await partial.click()
  await expect(page.getByRole('button', { name: 'Ver pedido', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Ver pedido', exact: true }).click()
}
async function cashValue(page) {
  await openShellDestination(page, 'Finanzas')
  await selectFinanceSection(page, 'Caja')
  const text = await page.getByText('Saldo esperado', { exact: true }).locator('..').innerText()
  return Number(text.match(/Gs\s*([\d.]+)/)?.[1].replaceAll('.', ''))
}
async function reportValues(page) {
  await openShellDestination(page, 'Análisis')
  await selectAnalysisSection(page, 'Reportes')
  const kpis = page.getByTestId('reportes-kpis')
  await expect(kpis).toBeVisible()
  const parse = async label => Number((await kpis.getByText(label, { exact: true }).locator('..').innerText()).match(/Gs\s*([\d.]+)/)?.[1].replaceAll('.', ''))
  return { sold: await parse('Total del período'), collected: await parse('Cobrado') }
}
const line = { key: 'qa-funda', productoId: 'demo-funda-magsafe-transparente', nombre: 'Funda MagSafe Transparente', quantity: 1, precio: 180000 }
const pay = (accountId, n) => ({ medioPago: 'x', cuenta: 'x', accountId, originalAmount: String(n), exchangeRatePyg: '', monto: String(n) })

test('461-1 dos artículos, dos medios parciales, saldo, CRM, caja y reportes con oráculo fijo', async ({ page }) => {
  const clean = await enter(page)
  const reportBefore = await reportValues(page)
  const cashBefore = await cashValue(page)
  await cart(page, [{ ...line }, { key: 'qa-telefono', productoId: 'demo-iphone-15-128-azul', nombre: 'iPhone 15 128GB Azul', quantity: 1, precio: 4850000, requiereSerie: true }], [pay('demo-cash-pyg', 300000), pay('demo-transfer-itau', 700000)])
  // Oráculo externo al producto: 180000 + 4850000 = 5030000;
  // 300000 + 700000 = 1000000, restante4030000; efectivo final4330000.
  await expect(page.getByTestId('carrito-total')).toContainText('5.030.000')
  await finish(page)
  const summary = page.getByTestId('pedido-totales-f3')
  for (const n of [5030000, 1000000, 4030000]) await expect(summary).toContainText(gs(n))
  const sale = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().find(row => row.items?.some(item => item.description === 'Funda MagSafe Transparente') && row.items?.some(item => item.description === 'iPhone 15 128GB Azul')))
  expect(sale.pagos.map(row => Number(row.monto)).sort((a, b) => a-b)).toEqual([300000, 700000])
  await page.getByRole('button', { name: /^Cobrar saldo/ }).click()
  const modal = page.getByRole('dialog').filter({ hasText: /^Pagos ·/ })
  await modal.getByLabel('Cuenta de destino').selectOption('demo-cash-pyg')
  await modal.getByLabel('Monto del pago').fill('4030000')
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(modal.getByTestId('pago-aviso')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Cobrar saldo/ })).toHaveCount(0)
  const ledger = await page.evaluate(async id => {
    const sale = (await import('/src/lib/storage.js')).listVentas().find(row => row.id === id)
    const customer = (await import('/src/lib/demoClientes.js')).buscarClienteDemo(sale.clienteId)
    const crm = customer.demoProfile.orders.find(row => row.orderNumber === sale.orderNumber)
    return { rows: (await import('/src/lib/storage.js')).listVentas().filter(row => row.orderNumber === sale.orderNumber).length, price: sale.precio, payments: sale.pagos.map(row => ({ amount: Number(row.monto), method: row.medioPago, accountId: row.accountId })), crm, sale }
  }, sale.id)
  expect(ledger.rows).toBe(1)
  expect(ledger.payments.reduce((sum, row) => sum + row.amount, 0)).toBe(5030000)
  expect(ledger.crm.pendingPyg).toBe(0)
  expect(ledger.crm.collectedPyg).toBe(5030000)
  const cashAfter = await cashValue(page)
  expect(cashAfter-cashBefore).toBe(4330000)
  const reportAfter = await reportValues(page)
  expect(reportAfter.sold-reportBefore.sold).toBe(5030000)
  expect(reportAfter.collected-reportBefore.collected).toBe(5030000)
  console.log('QA461-1', JSON.stringify({ cashBefore, cashAfter, delta: cashAfter-cashBefore, payments: ledger.payments, crm: { collectedPyg: ledger.crm.collectedPyg, pendingPyg: ledger.crm.pendingPyg }, reportBefore, reportAfter }))
  clean()
})

test('461-2 cotización convierte una vez con número único y total igual a sus líneas', async ({ page }) => {
  const clean = await enter(page)
  const result = await page.evaluate(async () => {
    const { listDemoQuotes } = await import('/src/lib/demo/cotizaciones.js')
    const { convertirDemoCotizacion } = await import('/src/lib/demoCotizacionConversion.js')
    const { listVentas } = await import('/src/lib/storage.js')
    const quote = listDemoQuotes().find(row => ['ACCEPTED','SENT'].includes(row.status))
    const before = listVentas().map(row => row.orderNumber)
    const first = convertirDemoCotizacion(quote.id, {})
    const second = convertirDemoCotizacion(quote.id, {})
    return { quote, first, second, before, after: listVentas().filter(row => row.orderNumber === first.orderNumber) }
  })
  expect(result.before).not.toContain(result.first.orderNumber)
  expect(result.first.orderNumber).not.toContain('#')
  expect(result.second).toBeNull()
  expect(result.after).toHaveLength(1)
  const oracle = result.quote.items.reduce((sum, item) => sum + Number(item.quantity)*Number(item.unitPricePyg),0) - Number(result.quote.discountPyg || 0)
  console.log('QA461-2-ORACLE', JSON.stringify({ quoteTotal: result.quote.totalPyg, discount: result.quote.discountPyg, oracle, convertedTotal: result.after[0].precio }))
  expect(result.after[0].precio).toBe(oracle)
  await openShellDestination(page, 'Pedidos')
  await expect(page.getByText(result.first.orderNumber, { exact: true }).first()).toBeVisible()
  await page.getByText(result.first.orderNumber, { exact: true }).first().click()
  await expect(page.getByTestId('pedido-totales-f3')).toContainText(gs(oracle))
  await expect(page.getByRole('button', { name: /^Cobrar saldo/ })).toContainText(gs(oracle))
  const crm = await page.evaluate(async ({ customerId, number }) => (await import('/src/lib/demoClientes.js')).buscarClienteDemo(customerId).demoProfile.orders.find(row => row.orderNumber === number), { customerId: result.quote.customerId, number: result.first.orderNumber })
  expect(crm.totalPyg).toBe(oracle)
  expect(crm.pendingPyg).toBe(oracle)
  console.log('QA461-2', JSON.stringify({ number: result.first.orderNumber, quoteTotal: result.quote.totalPyg, orderTotal: result.after[0].precio, repeat: result.second }))
  clean()
})

test('461-3 residuo USD se completa en Gs y pedido sin saldo fantasma', async ({ page }) => {
  const clean = await enter(page)
  await cart(page, [{ ...line }])
  await page.getByTestId('pos-cobro').getByRole('button', { name: '+ Agregar pago', exact: true }).click()
  const row = page.getByTestId('pago-fila-0')
  await row.getByLabel('Cuenta de cobro').click()
  await page.getByRole('listbox', { name: 'Cuentas de cobro' }).getByRole('option', { name: /Caja.*Dólares/ }).first().click()
  await row.getByLabel('Monto original').fill('24,65')
  await row.getByLabel(/^Cotización manual USD/).fill('7300')
  // 2465centavos×7300/100 =179945Gs. Resto55, sin usar helper de producto.
  await expect(page.getByTestId('cobro-pendiente')).toContainText('55')
  await page.getByTestId('cobro-completar-gs').click()
  await expect(page.getByTestId('cobro-pendiente')).toContainText('Gs 0')
  await finish(page)
  await expect(page.getByRole('button', { name: /^Cobrar saldo/ })).toHaveCount(0)
  const payment = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas()[0])
  expect(payment.totalPyg).toBe(180000)
  expect(payment.totalPendiente).toBe(0)
  expect(payment.pagos.map(row => Number(row.monto))).toEqual([179945, 55])
  console.log('QA461-3', JSON.stringify({ total: payment.totalPyg, pending: payment.totalPendiente, payments: payment.pagos.map(row => ({ amount: row.monto, currency: row.currency, original: row.originalAmount })) }))
  clean()
})

test('461-4 recepción rechaza999 y confirmar manifiesto suma exactamente unidades al stock', async ({ page }) => {
  const clean = await enter(page)
  const before = await page.evaluate(async () => (await import('/src/lib/demoInventory.js')).listDemoUnits().map(row => row.serial))
  await openShellDestination(page, 'Recepción')
  await page.getByTestId('recepcion-llegada').filter({ hasText: 'LOTE-AUR-0002' }).getByRole('button', { name: /Recibir|Retomar/ }).click()
  const input = page.getByRole('textbox', { name: /IMEI|escanear/i }).first()
  await input.fill('999')
  await input.press('Enter')
  await expect(page.getByTestId('recepcion-aviso')).toBeVisible()
  expect(await page.evaluate(async () => (await import('/src/lib/demoInventory.js')).listDemoUnits().length)).toBe(before.length)
  const expectedCards = await page.getByTestId('recepcion-esperado').allTextContents()
  const serials = expectedCards.map(text => text.match(/35\d{13}/)?.[0]).filter(Boolean)
  expect(serials).toHaveLength(3)
  for (const serial of serials) { await input.fill(serial); await input.press('Enter') }
  await page.getByLabel('Depósito destino', { exact: true }).selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click()
  await expect(page.getByTestId('recepcion-confirmada')).toBeVisible()
  const added = await page.evaluate(async before => (await import('/src/lib/demoInventory.js')).listDemoUnits().filter(row => !before.includes(row.serial)), before)
  expect(added.map(row => row.serial).sort()).toEqual(serials.sort())
  expect(added.every(row => row.status === 'AVAILABLE')).toBe(true)
  console.log('QA461-4', JSON.stringify({ declaredReceived: serials, unitsAdded: added.length, remainingWithoutImei: 5 }))
  clean()
})

test('451-5 conciliación demo verifica día con declaración propia y nota de diferencia', async ({ page }) => {
  // Este conteo independiente corresponde al seed del15/10, no a cualquier día.
  await page.clock.setFixedTime(new Date('2026-10-15T15:00:00Z'))
  const clean = await enter(page)
  await openShellDestination(page, 'Finanzas')
  await selectFinanceSection(page, 'Conciliación')
  await page.getByRole('button', { name: 'Verificar día por sucursal', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Conciliar día por sucursal' })
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Pendiente')
  const inputs = dialog.getByRole('textbox', { name: /^Recibido en Gs:/ })
  const declared = [9900000, 3050000, 30000, 3250000]
  expect(await inputs.count()).toBe(4)
  const before = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().flatMap(row => row.pagos || []).reduce((sum,p) => sum + Number(p.monto || 0),0))
  // Conteos ficticios explícitos: se declara1Gs menos de efectivo para exigir
  // diferencia+motivo, luego conteo completo; no es saldo bancario real.
  for (let i=0;i<declared.length;i++) await inputs.nth(i).fill(String(declared[i]-(i===0?1:0)))
  const verify = dialog.getByRole('button', { name: 'Verificar día', exact: true })
  await expect(verify).toBeDisabled()
  await dialog.getByLabel('Motivo / nota del día', { exact: true }).fill('QA conteo sintético: falta un guaraní')
  await verify.click()
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Con diferencia')
  await inputs.first().fill(String(declared[0]))
  await verify.click()
  await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Verificado')
  const after = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().flatMap(row => row.pagos || []).reduce((sum,p) => sum + Number(p.monto || 0),0))
  expect(after).toBe(before)
  console.log('QA451-5', JSON.stringify({ declared, total: 16230000, differenceFirst: -1, stateFinal: 'Verificado', businessPaymentDelta: after-before }))
  clean()
})

test('451-6 historial, accesorios y reportes tienen datos coherentes en sesión browser', async ({ page }) => {
  const clean = await enter(page)
  const raw = await page.evaluate(async () => ({ sales: (await import('/src/lib/storage.js')).listVentas(), products: (await import('/src/lib/storage.js')).getProductos(), units: (await import('/src/lib/demoInventory.js')).listDemoUnits() }))
  const days = new Set(raw.sales.map(row => String(row.fecha).slice(0,10)))
  expect(days.size).toBeGreaterThanOrEqual(80)
  expect(raw.units.length).toBeGreaterThanOrEqual(60)
  expect(raw.products.some(row => /AirPods/i.test(row.nombre))).toBe(true)
  const airpods = raw.products.filter(row => /AirPods/i.test(row.nombre)).map(row => ({ id: row.id, stockKind: row.stockKind }))
  console.log('QA451-6', JSON.stringify({ sales: raw.sales.length, distinctDays: days.size, units: raw.units.length, airpods }))
  await openShellDestination(page, 'Análisis')
  await selectAnalysisSection(page, 'Reportes')
  await expect(page.locator('main')).toContainText('Métricas')
  clean()
})

test('461-7 unidades cargan, delivery asigna y taller avanza en demo', async ({ page }) => {
  const clean = await enter(page)
  const evidence = {}
  for (const destination of ['Unidades', 'Delivery', 'Taller y garantías']) {
    await openShellDestination(page, destination)
    await expect.poll(() => page.locator('main button:visible').count()).toBeGreaterThan(0)
    evidence[destination] = { path: new URL(page.url()).pathname, buttons: await page.locator('main button:visible').allTextContents(), selects: await page.locator('main select:visible').allTextContents() }
    if (destination === 'Delivery') {
      const card = page.getByTestId('reparto-admin-pedido').first()
      const number = await card.getAttribute('data-pedido')
      const select = card.locator('select')
      await select.selectOption({ index: 1 })
      const driver = await select.inputValue()
      await card.getByTestId('asignar-reparto').click()
      await expect.poll(() => page.evaluate(async ({ number, driver }) => (await import('/src/lib/demo/delivery.js')).listDemoDeliveryOrders().some(row => row.orderNumber === number && row.assignedToId === driver), { number, driver })).toBe(true)
      evidence.deliveryMutation = { number, driver, assigned: true }
    }
    if (destination === 'Taller y garantías') {
      const advance = page.getByRole('button', { name: /^Pasar a / }).first()
      const target = (await advance.getAttribute('aria-label')).replace('Pasar a ', '')
      await advance.click()
      await expect(page.getByTestId('taller-avance-feedback')).toBeVisible()
      evidence.serviceMutation = { target, feedback: await page.getByTestId('taller-avance-feedback').innerText() }
    }

  }
  console.log('QA461-7', JSON.stringify(evidence))
  clean()
})

test('461-8 recepción: contador IMEI faltantes coincide con manifiesto real del lote', async ({ page }) => {
  const clean = await enter(page)
  await openShellDestination(page, 'Recepción')
  const card = page.getByTestId('recepcion-llegada').filter({ hasText: 'LOTE-AUR-0002' })
  const text = await card.innerText()
  const reportedMissing = Number(text.match(/(\d+) con IMEI por completar/)?.[1])
  await card.getByRole('button', { name: /Recibir|Retomar/ }).click()
  const rows = await page.getByTestId('recepcion-esperado').allTextContents()
  const actualMissing = rows.filter(text => text.includes('IMEI por completar')).length
  const actualWithSerial = rows.filter(text => /35\d{13}/.test(text)).length
  console.log('QA461-8', JSON.stringify({ card: text, rows: rows.length, reportedMissing, actualMissing, actualWithSerial }))
  expect(rows.length).toBe(8)
  expect(actualWithSerial).toBe(3)
  expect(actualMissing).toBe(5)
  expect(reportedMissing).toBe(actualMissing)
  clean()
})

// #500/#451: el historial cambia por calendario de Paraguay, nunca por UTC.
// Oráculos independientes: sumar pagos originales por etiqueta/cuenta, sin usar
// construirDemoConciliacionDia/evaluarConciliacionDia ni leer montos del panel.
test.describe('451 conciliación al cambiar el día de Paraguay', () => {
  test.use({ timezoneId: 'UTC' })
  for (const [instant, day, cash, historicalAccount, historicalAmount] of [
    ['2026-10-15T23:59:59Z', '2026-10-15', 9900000, 'Ueno · Caja de ahorro', 3050000],
    ['2026-10-16T00:00:00Z', '2026-10-15', 9900000, 'Ueno · Caja de ahorro', 3050000],
    ['2026-10-16T02:59:59Z', '2026-10-15', 9900000, 'Ueno · Caja de ahorro', 3050000],
    ['2026-10-16T03:00:00Z', '2026-10-16', 10110000, 'Continental · Cuenta corriente', 719000],
    ['2026-10-16T03:24:00Z', '2026-10-16', 10110000, 'Continental · Cuenta corriente', 719000],
  ]) test(`conteo propio ${instant}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(instant))
    const clean = await enter(page)
    const ledger = await page.evaluate(async day => {
      const sales = (await import('/src/lib/storage.js')).listVentas()
      const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' })
      const amounts = {}
      const paymentIds = []
      for (const sale of sales) for (const p of sale.pagos || []) {
        if (format.format(new Date(p.fecha)) !== day) continue
        // Los seed actuales de estos dos días tienen CASH/CARD/TRANSFER y
        // crédito de tienda (este último se excluye: no es dinero recibido).
        if (!['DINERO', 'POS UENO', 'TARJETA', 'UENO BANK', 'TRANSFERENCIA'].includes(p.medioPago)) continue
        const label = p.medioPago === 'DINERO' ? 'Efectivo' : p.cuenta
        amounts[label] = (amounts[label] || 0) + Number(p.monto)
        paymentIds.push(p.id)
      }
      return { amounts, paymentIds, before: JSON.stringify(sales) }
    }, day)
    const declared = { Efectivo: cash, [historicalAccount]: historicalAmount, 'Caja · Guaraníes': 30000, 'Itaú · Cuenta corriente': 3250000 }
    expect(ledger.amounts).toEqual(declared)
    expect(new Set(ledger.paymentIds).size).toBe(ledger.paymentIds.length)
    await openShellDestination(page, 'Finanzas')
    await selectFinanceSection(page, 'Conciliación')
    await page.getByRole('button', { name: 'Verificar día por sucursal', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Conciliar día por sucursal' })
    await expect(dialog.getByLabel('Día de Paraguay', { exact: true })).toHaveValue(day)
    const inputs = dialog.getByRole('textbox', { name: /^Recibido en Gs:/ })
    await expect(inputs).toHaveCount(Object.keys(declared).length)
    for (const [label, amount] of Object.entries(declared)) await dialog.getByRole('textbox', { name: `Recibido en Gs: ${label} (PYG)`, exact: true }).fill(String(amount))
    await dialog.getByRole('button', { name: 'Verificar día', exact: true }).click()
    await expect(dialog.getByTestId('conciliacion-dia-estado')).toHaveText('Verificado')
    expect(await page.evaluate(async () => JSON.stringify((await import('/src/lib/storage.js')).listVentas()))).toBe(ledger.before)
    console.log('QA451-DIA', JSON.stringify({ instant, day, declared, total: Object.values(declared).reduce((a,b) => a+b,0), businessDelta: 0 }))
    clean()
  })
})
