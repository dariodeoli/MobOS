import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'
test('antes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/**', route => (!new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => { sessionStorage.setItem('mobos:demo-guia-vista', '1'); localStorage.setItem('mobos:aviso-metricas', '1') })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, 'Dueño')
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Inicio')
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().length)).toBeGreaterThan(15)
  const numero = await page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().find(v => v.id === 'demo-venta-hoy-partial').orderNumber)
  await openShellDestination(page, 'Pedidos')
  await page.getByText(numero, { exact: false }).first().click()
  await expect(page.getByText('Artículos preparados')).toBeVisible()
  console.log('CLIENTE>>', await page.getByTestId('pedido-cliente').innerText())
  await page.screenshot({ path: process.env.SHOT || 'docs/rediseno/pedido-shopify-antes.png', fullPage: false })
})
