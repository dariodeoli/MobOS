// Comprobante rápido en Vendidos (#215 §10): un clic en el ícono de la fila
// imprime el comprobante de la venta (nivel Rápido) sin abrir la ficha ni salir
// de la lista. Con agente se inspecciona el ticket ESC/POS; sin agente ni
// impresora, el respaldo deja el PDF en 80 mm con OrderReceipt.

import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { SEED } from './helpers/seed-data.js'

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

const textoDelTicket = (capturado) => Buffer.from(String(capturado?.data || ''), 'base64').toString('latin1')

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
  await page.goto('/inventario/vendidos')
  await page.getByLabel('Buscar en inventario').fill(serial)
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  return fila
}

test('el ícono de Vendidos imprime el comprobante rápido (80 mm) sin abrir la ficha', async ({ page }) => {
  const capturados = []
  await agenteFalso(page, capturados)
  const marca = Date.now()
  const serial = `353000${String(marca).slice(-8)}`
  await page.goto('/inventario/unidades')
  await sembrarVendida(page, { marca, serial })

  const fila = await abrirFilaVendida(page, serial)
  await page.screenshot({ path: `${SALIDA}/01-fila-vendidos.jpg` })
  const boton = fila.getByRole('button', { name: `Imprimir comprobante rápido de ${serial}` })
  await expect(boton).toHaveAttribute('title', /comprobante rápido/i)
  await boton.click()
  await expect(page.getByText(/enviada a la impresora/)).toBeVisible({ timeout: 15_000 })

  expect(capturados).toHaveLength(1)
  expect(capturados[0].tipo).toBe('comprobante')
  const texto = textoDelTicket(capturados[0])
  expect(texto).toContain('Comprobante de compra')
  expect(texto).toContain('Documento no fiscal')
  expect(texto).toContain('1.000.000')
  // Nivel Rápido: el QR del nivel va con su enlace de seguimiento.
  expect(texto).toMatch(/\/pedidos\//)
  // No se abrió la ficha: seguimos en la lista.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(fila).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/02-impreso-sin-salir.jpg` })
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
  await fila.getByRole('button', { name: `Imprimir comprobante rápido de ${serial}` }).click()

  // El respaldo abre el HTML imprimible en un iframe oculto (sin ventanas).
  const marco = page.locator('iframe[aria-hidden="true"]').last()
  await marco.waitFor({ state: 'attached', timeout: 10_000 })
  const contenido = await marco.contentFrame().locator('body').innerText()
  expect(contenido).toContain('Documento no fiscal')
  expect(contenido).toContain('1.000.000')
  await page.screenshot({ path: `${SALIDA}/03-respaldo-iframe.jpg` })

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
  await hoja.screenshot({ path: `${SALIDA}/04-comprobante-rapido-80.jpg`, type: 'jpeg', quality: 75, fullPage: true })
  await hoja.close()

  // Sin salir de la lista: la fila sigue visible y no hay ficha abierta.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(fila).toBeVisible()
})
