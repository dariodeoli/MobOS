import { test, expect } from '@playwright/test'
import { leerRaster } from '../helpers/raster-qr.js'
const token = 'Abcdefghijklmnopqrstuvwxyz0123_-'
const order = { id: 'quick513', orderNumber: 'QA-5132', createdAt: '2026-10-15T12:00:00Z', status: 'PAID', totalPyg: 1000000, customer: { name: 'Cliente ficticio' }, items: [{ description: 'Equipo ficticio', quantity: 1, unitPricePyg: 1000000, totalPyg: 1000000 }], payments: [{ method: 'CASH', status: 'CONFIRMED', amountPyg: 1000000 }] }
const printer = { id: 'cmfixtureprinter00000000001', modelo: 'ZKP8008', model: 'ZKP8008', ancho: 80, width: 80, destino: 'lan:192.0.2.99:9100', destination: 'lan:192.0.2.99:9100', activa: true, isActive: true, predeterminada: true, isDefault: true, corte: true, cut: true, copias: 2, copies: 2 }
async function setup(page, { remote = false, model = 'ZKP8008', noPrinter = false, phase, hold, duplicate = false } = {}) {
  const sent = [], tokens = []
  await page.addInitScript(() => {
    window.rasterHtml = []
    const write = Document.prototype.write
    Document.prototype.write = function (...args) { if (this.defaultView?.frameElement?.hasAttribute('data-png-documento')) window.top.rasterHtml.push(args.join('')); return write.apply(this, args) }
  })
  await page.route('https://**', route => route.abort())
  await page.route('http://127.0.0.1:17890/**', route => {
    if (remote || noPrinter) return route.abort()
    if (route.request().method() === 'POST') sent.push(route.request().postDataJSON())
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, json: { ok: true } })
  })
  await page.route('**/api/**', async route => {
    const p = new URL(route.request().url()).pathname
    if (!p.startsWith('/api/')) return route.continue()
    if (phase && p === phase) await hold()
    if (p === '/api/orders/quick513') return route.fulfill({ json: order })
    if (p === '/api/orders/quick513/access-tokens') { tokens.push(route.request().postDataJSON()); return route.fulfill({ json: { token } }) }
    if (p === '/api/tenant/logo') return route.fulfill({ status: 404, json: {} })
    if (p === '/api/print/printers') return route.fulfill({ json: { printers: noPrinter ? [] : [{ ...printer, model }], bridges: [], remoteEnabled: true } })
    if (p === '/api/print/jobs' && route.request().method() === 'POST') { sent.push(route.request().postDataJSON()); return route.fulfill(duplicate && sent.length > 1 ? { status: 409, json: { duplicate: true, message: 'Ya hay una impresión pendiente' } } : { status: 201, json: { job: { id: 'cmfixturejob00000000000001', state: 'PENDIENTE' } } }) }
    return route.fulfill({ json: {} })
  })
  await page.goto('/e2e/fixtures/plantillas507.html')
  await page.evaluate(({ printer, model, noPrinter }) => import('/src/lib/printing/agent.js').then(a => { a.usarTenantImpresoras('fixture-A'); a.guardarImpresoras('fixture-A', { impresoras: noPrinter ? [] : [{ ...printer, modelo: model }], agentUrl: 'http://127.0.0.1:17890', remoteEnabled: true }) }), { printer, model, noPrinter })
  return { sent, tokens }
}
const print = page => page.evaluate(async () => (await import('/src/components/stock/impresionStock.js')).printQuickReceipt({ sale: { orderId: 'quick513' } }))
for (const remote of [false, true]) test(`513 Vendidos ${remote ? 'remoto' : 'local'} imprime el HTML premium rápido exacto y QR píxeles`, async ({ page }) => {
  const { sent, tokens } = await setup(page, { remote })
  const result = await print(page)
  expect(result.ok).toBe(true)
  expect(sent).toHaveLength(1)
  const decoded = leerRaster(sent[0].data || sent[0].payload)
  expect(decoded.cuts).toBe(1)
  expect(decoded.pages.map(p => p.qr)).toEqual([`https://clientes.example.invalid/pedidos/${token}`])
  expect(sent[0].copias || sent[0].copies).toBe(2)
  expect(sent[0].impresora || sent[0].destination).toBe(printer.destino)
  expect(sent[0].ref || sent[0].reference).toBe(order.orderNumber)
  expect(tokens).toEqual([{ level: 'rapido', impreso: true }])
  const html = await page.evaluate(async ({ order, token }) => (await import('/src/components/shared/OrderReceipt.jsx')).buildOrderReceiptHtml(order, { level: 'rapido', format: 'thermal-80', token }), { order, token })
  expect(await page.evaluate(() => window.rasterHtml)).toEqual([html])
  expect(html).toContain('1.000.000')
  expect(html).toContain('Documento no fiscal')
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
})
for (const phase of ['/api/orders/quick513', '/api/orders/quick513/access-tokens', '/api/tenant/logo']) test(`513 Vendidos A→B→A durante ${phase} no envía ni abre respaldo`, async ({ page }) => {
  let started, release
  const ready = new Promise(r => started = r)
  const { sent, tokens } = await setup(page, { phase, hold: () => { started(); return new Promise(r => release = r) } })
  const pending = print(page)
  await ready
  await page.evaluate(async () => { const a = await import('/src/lib/printing/agent.js'); a.usarTenantImpresoras('fixture-B'); a.usarTenantImpresoras('fixture-A') })
  release()
  const result = await pending
  expect(result.ok).toBe(false)
  expect(result.motivo).toBe('contexto-cambiado')
  expect(sent).toHaveLength(0)
  if (phase === '/api/orders/quick513') expect(tokens).toHaveLength(0)
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
})
test('513 Vendidos sin impresora respalda el mismo HTML sin enviar bytes', async ({ page }) => {
  const { sent } = await setup(page, { noPrinter: true })
  const result = await print(page)
  expect(result.ok).toBe(false)
  expect(result.dialogo).toBe(true)
  const frame = page.locator('iframe[aria-hidden="true"]').last().contentFrame()
  await expect(frame.locator('body')).toContainText('1.000.000')
  await expect(frame.locator('body')).toContainText('Documento no fiscal')
  expect(sent).toHaveLength(0)
})
test('513 Vendidos modelo desconocido rechaza sin formatter antiguo ni respaldo automático', async ({ page }) => {
  const { sent } = await setup(page, { model: 'QL-800' })
  const result = await print(page)
  expect(result.ok).toBe(false)
  expect(result.error).toContain('ZKP8008')
  expect(sent).toHaveLength(0)
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
})
test('513 Vendidos duplicado remoto mantiene referencia y QR sin reenvío ni diálogo automático', async ({ page }) => {
  const { sent } = await setup(page, { remote: true, duplicate: true })
  expect((await print(page)).ok).toBe(true)
  const result = await print(page)
  expect(result.duplicado).toBe(true)
  expect(sent).toHaveLength(2)
  expect(sent.map(job => job.reference)).toEqual([order.orderNumber, order.orderNumber])
  expect(sent[0].payload).toBe(sent[1].payload)
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
})

test('513 Vendidos no cae a remoto si cambia A→B→A durante el rechazo local', async ({ page }) => {
  const { sent } = await setup(page)
  let entered, release
  const waiting = new Promise(resolve => { entered = resolve })
  const held = new Promise(resolve => { release = resolve })
  let attempts = 0
  await page.route('http://127.0.0.1:17890/print', async route => {
    attempts++
    entered()
    await held
    await route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': '*' }, json: { error: 'Impresora no disponible' } })
  })
  const pending = print(page)
  await waiting
  await page.evaluate(async () => {
    const a = await import('/src/lib/printing/agent.js')
    a.usarTenantImpresoras('fixture-B'); a.usarTenantImpresoras('fixture-A')
  })
  release()
  const result = await pending
  expect(result.ok).toBe(false)
  expect(result.motivo).toBe('contexto-cambiado')
  expect(attempts).toBe(1)
  expect(sent).toEqual([])
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
})
