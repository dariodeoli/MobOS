// Demo · seguimiento por QR: el pedido demo vive solo en el navegador, así que el
// enlace del QR del comprobante lleva el resumen en el fragmento (#d=…). Abierto en
// un contexto NUEVO del navegador (otro dispositivo, sin el estado de la demo) la
// página pública muestra el pedido con la banda «Demo · datos ficticios», sin
// llamar al backend.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'
import { ensureCobro } from './helpers/ensure-cobro.js'
import { openShellDestination } from './helpers/shell-navigation.js'
import { abrirVistaPreviaComprobante } from './helpers/pedido-imprimir.js'

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

async function crearPedidoDemo(page) {
  await openShellDestination(page, 'POS')
  await page.getByPlaceholder('Buscar producto…').fill('Funda')
  await page.getByLabel('Resultados de productos').getByRole('button').filter({ hasText: /Funda/i }).first().click()
  await ensureCobro(page)
  await page.locator('input[placeholder="Buscar cliente o escribir un nombre nuevo"]').fill('Cliente Seguimiento Demo')
  await page.getByRole('button', { name: /Confirmar venta|Crear pedido/ }).last().click()
  await expect(page).toHaveURL(/\/pedidos\//, { timeout: 15_000 })
}

test('demo: el QR del comprobante abre el seguimiento del pedido en otro navegador', async ({ page, browser, baseURL }) => {
  await entrarDemo(page)
  await crearPedidoDemo(page)

  await abrirVistaPreviaComprobante(page)
  const iframe = page.locator('iframe[title="Vista previa del comprobante"]')
  await expect(iframe).toBeVisible()
  await expect.poll(() => iframe.evaluate((frame) => frame.contentDocument?.querySelector('img.qr')?.dataset?.enlace || ''), { timeout: 15_000 }).toContain('#d=')
  const enlace = await iframe.evaluate((frame) => frame.contentDocument.querySelector('img.qr').dataset.enlace)
  const url = new URL(enlace)
  expect(url.pathname).toMatch(/^\/pedidos\/demo-/)
  expect(url.hash.length).toBeLessThanOrEqual(1500 + 3)

  // Contexto nuevo: sin sesión ni almacenamiento de la demo. El host del QR es el
  // portal real; en e2e se abre la misma ruta pública en el servidor local.
  const otro = await browser.newContext({ baseURL })
  const publica = await otro.newPage()
  const llamadasApi = []
  publica.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/orders/public')) llamadasApi.push(request.url()) })
  await publica.goto(`/pedido/${url.pathname.split('/').pop()}${url.hash}`)
  await expect(publica.getByTestId('banda-demo')).toContainText('Demo · datos ficticios')
  await expect(publica.getByTestId('estado-pedido')).toBeVisible()
  await expect(publica.getByRole('heading', { level: 1 })).toContainText(/\d{4}/)
  await expect(publica.getByText('Pedido no encontrado')).toHaveCount(0)
  await expect(publica.getByText(/Funda/i).first()).toBeAttached()
  // Sin datos personales del cliente en la página pública.
  await expect(publica.getByText('Cliente Seguimiento Demo')).toHaveCount(0)
  expect(llamadasApi).toEqual([])

  // Un enlace demo sin fragmento no llama al backend y lo explica.
  await publica.goto(`/pedido/${url.pathname.split('/').pop()}`)
  await expect(publica.getByText(/no trae los datos del pedido/)).toBeVisible()
  expect(llamadasApi).toEqual([])
  await otro.close()
})
