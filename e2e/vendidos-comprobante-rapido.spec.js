// Comprobante rápido en Vendidos (#215 §10): un clic en el ícono de la fila
// imprime el comprobante de la venta (nivel Rápido) sin abrir la ficha ni salir
// de la lista. Con agente se decodifica el QR del raster ESC/POS; sin agente ni
// impresora, el respaldo deja el PDF en 80 mm con OrderReceipt.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { configurarImpresoraRaster, leerRaster } from './helpers/raster-qr.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
// Las evidencias versionadas viven en docs/qa/215-comprobante-rapido (commiteadas
// por el slot); la corrida escribe en test-results/ (ignorado) para no ensuciar
// el árbol ni bloquear release:publish.
const SALIDA = 'test-results/qa-215-comprobante-rapido'
mkdirSync(SALIDA, { recursive: true })

async function apiPagina(page, ruta, opciones = {}) {
  return page.evaluate(
    async ({ api, ruta, opciones }) => {
      const respuesta = await fetch(`${api}${ruta}`, {
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...opciones,
      })
      const datos = await respuesta.json().catch(() => null)
      return { status: respuesta.status, datos }
    },
    { api: API, ruta, opciones },
  )
}

async function agenteFalso(page, capturados) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-mobos-print-token',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  await page.route('http://127.0.0.1:17890/**', (ruta) => {
    const peticion = ruta.request()
    if (peticion.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: cors })
    if (peticion.url().includes('/health')) {
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, version: '1.6.3', equipo: 'e2e' }) })
    }
    if (peticion.method() === 'POST' && peticion.url().endsWith('/print')) {
      capturados.push(JSON.parse(peticion.postData() || '{}'))
      return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, estado: 'impreso', transporte: 'lan' }) })
    }
    return ruta.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) })
  })
}

async function capturarHtmlRaster(page) {
  await page.addInitScript(() => {
    window.htmlRaster = []
    const write = Document.prototype.write
    Document.prototype.write = function (...args) {
      if (this.defaultView?.frameElement?.hasAttribute('data-png-documento')) window.top.htmlRaster.push(args.join(''))
      return write.apply(this, args)
    }
  })
}

// Producto + unidad + venta: la unidad queda SOLD y con su pedido asociado.
async function sembrarVendida(page, { marca, serial }) {
  const producto = await apiPagina(page, '/api/products', {
    method: 'POST',
    body: JSON.stringify({ sku: `E2E-QR-${marca}`, name: `Equipo vendido ${marca}`, model: 'iPhone 15 Pro', capacity: '256GB', pricePyg: 1000000, costPyg: 700000, stock: 0, branchId: 'e2e-branch-1' }),
  })
  expect(producto.status, JSON.stringify(producto.datos)).toBe(201)
  const unidad = await apiPagina(page, '/api/inventory-units', {
    method: 'POST',
    body: JSON.stringify({ productId: producto.datos.id, branchId: 'e2e-branch-1', serial }),
  })
  expect(unidad.status, JSON.stringify(unidad.datos)).toBe(201)
  const pedido = await apiPagina(page, '/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      customer: { name: `Cliente comprobante ${marca}` },
      items: [{ productId: producto.datos.id, description: `Equipo vendido ${marca}`, quantity: 1, unitPricePyg: 1000000, inventoryUnitSerials: [serial] }],
      payment: { method: 'CASH', amountPyg: 1000000 },
    }),
  })
  expect(pedido.status, JSON.stringify(pedido.datos)).toBe(201)
  return pedido.datos
}

async function abrirFilaVendida(page, serial) {
  await page.goto(`/stock/vendidos?q=${encodeURIComponent(serial)}`)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  return fila
}

test('el ícono de Vendidos imprime el comprobante rápido (80 mm) sin abrir la ficha', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  await capturarHtmlRaster(page)
  const marca = Date.now()
  const serial = `353000${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarVendida(page, { marca, serial })

  const fila = await abrirFilaVendida(page, serial)
  await configurarImpresoraRaster(page, API)
  if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${SALIDA}/01-fila-vendidos.jpg` })
  // Stock: el comprobante rápido es una acción del menú de la fila (sin abrir la ficha).
  await fila.getByLabel(/^Acciones de/).click()
  const boton = page.getByRole('menuitem', { name: 'Comprobante rápido' })
  await expect(boton).toHaveAttribute('title', /comprobante/i)
  const tokenResponse = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/access-tokens'))
  await boton.click()
  await expect(page.getByText(/enviada a la impresora/)).toBeVisible({ timeout: 30_000 })
  // El trabajo puede tardar en llegar al agente en CI: se espera antes de mirar.
  await expect.poll(() => capturados.length, { timeout: 20_000 }).toBe(1)
  expect(capturados[0].tipo).toBe('comprobante')
  const token = (await (await tokenResponse).json()).token
  expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
  const raster = leerRaster(capturados[0].data)
  expect(raster.cuts).toBe(1)
  expect(raster.pages).toHaveLength(1)
  expect(new URL(raster.pages[0].qr).pathname).toBe(`/pedidos/${token}`)
  expect(capturados[0].copias).toBe(1)
  const html = await page.evaluate(() => window.htmlRaster)
  expect(html).toHaveLength(1)
  expect(html[0]).toMatch(/comprobante de compra/i)
  expect(html[0]).toContain('Documento no fiscal')
  expect(html[0]).toContain('1.000.000')
  // No se abrió la ficha: seguimos en la lista.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(fila).toBeVisible()
  if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${SALIDA}/02-impreso-sin-salir.jpg` })
})

test('sin agente ni impresora, el respaldo deja el PDF del comprobante en 80 mm', async ({ page }) => {
  await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
  await page.route('**/api/print/printers', (ruta) => ruta.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ printers: [], bridges: [], remoteEnabled: true }),
  }))
  const marca = Date.now()
  const serial = `353100${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarVendida(page, { marca, serial })

  const fila = await abrirFilaVendida(page, serial)
  await fila.getByLabel(/^Acciones de/).click()
  await page.getByRole('menuitem', { name: 'Comprobante rápido' }).click()

  // El respaldo abre el HTML imprimible en un iframe oculto (sin ventanas).
  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 10_000 })
  const contenido = await marco.contentFrame().locator('body').innerText()
  expect(contenido).toContain('Documento no fiscal')
  expect(contenido).toContain('1.000.000')
  if (process.env.MOBOS_QA_SCREENSHOTS === '1') await page.screenshot({ path: `${SALIDA}/03-respaldo-iframe.jpg` })

  // PDF de 80 mm con el mismo HTML que la app manda a «Guardar como PDF».
  const html = await marco.contentFrame().locator('html').evaluate((el) => el.outerHTML)
  const hoja = await page.context().newPage()
  await hoja.setViewportSize({ width: 302, height: 800 })
  await hoja.emulateMedia({ media: 'print' })
  await hoja.setContent(html, { waitUntil: 'load' })
  await hoja.waitForTimeout(250)
  const altoPx = await hoja.locator('body').evaluate((body) => body.getBoundingClientRect().height)
  await hoja.pdf({
    path: `${SALIDA}/comprobante-rapido-80.pdf`,
    width: '80mm',
    height: `${Math.ceil((altoPx / 3.7795275591) + 12)}mm`,
    printBackground: true,
    margin: { top: '5mm', bottom: '5mm', left: '4mm', right: '4mm' },
  })
  if (process.env.MOBOS_QA_SCREENSHOTS === '1') await hoja.screenshot({ path: `${SALIDA}/04-comprobante-rapido-80.jpg`, type: 'jpeg', quality: 75, fullPage: true })
  await hoja.close()

  // Sin salir de la lista: la fila sigue visible y no hay ficha abierta.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(fila).toBeVisible()
})

// El stock unificado solo tiene soldAt: el hook debe resolver la unidad antes
// de imprimir. Cambiar A→B→A durante esa resolución no autoriza token ni envío.
test('Vendidos invalida el contexto antes de resolver la unidad y permite un nuevo intento', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serial = `353200${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarVendida(page, { marca, serial })
  const fila = await abrirFilaVendida(page, serial)
  await configurarImpresoraRaster(page, API)
  let entered, release
  const esperando = new Promise(resolve => { entered = resolve })
  const liberado = new Promise(resolve => { release = resolve })
  let retener = true
  await page.route('**/api/inventory-units?**', async route => {
    if (!retener || new URL(route.request().url()).searchParams.get('q') !== serial) return route.continue()
    retener = false
    const response = await route.fetch()
    entered()
    await liberado
    await route.fulfill({ response })
  })
  const tokens = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/access-tokens')) tokens.push(request.url())
  })
  const acciones = fila.getByLabel(/^Acciones de/)
  await acciones.click()
  await page.getByRole('menuitem', { name: 'Comprobante rápido' }).click()
  await esperando
  await expect(acciones).toBeDisabled()
  await page.evaluate(async () => {
    const { usarTenantImpresoras } = await import('/src/lib/printing/agent.js')
    const { contextoActual } = await import('/src/lib/storage.js')
    const empresa = contextoActual().empresaId
    usarTenantImpresoras('quick513-otra-empresa')
    usarTenantImpresoras(empresa)
  })
  release()
  // busy del consumidor vuelve a false en finally; no se usa una pausa fija.
  await expect(acciones).toBeEnabled()
  expect(tokens).toEqual([])
  expect(capturados).toEqual([])
  await expect(page.getByText(/enviada a la impresora/)).toHaveCount(0)
  await expect(page.locator('iframe[aria-hidden="true"]')).toHaveCount(0)
  await acciones.click()
  await page.getByRole('menuitem', { name: 'Comprobante rápido' }).click()
  await expect.poll(() => capturados.length).toBe(1)
  expect(tokens).toHaveLength(1)
  expect(leerRaster(capturados[0].data).pages[0].qr).toMatch(/\/pedidos\/[A-Za-z0-9_-]{32}$/)
})
