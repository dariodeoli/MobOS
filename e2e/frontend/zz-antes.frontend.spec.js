import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'
test('antes', async ({ page }) => {
  await page.setViewportSize({ width: Number(process.env.W || 1280), height: 900 })
  await page.route('**/api/**', route => (!new URL(route.request().url()).pathname.startsWith('/api/') ? route.continue() : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => { sessionStorage.setItem('mobos:demo-guia-vista', '1'); localStorage.setItem('mobos:aviso-metricas', '1') })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, 'Dueño')
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Inicio')
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).listVentas().length)).toBeGreaterThan(15)
  await openShellDestination(page, 'Pedidos')
  await page.getByTestId('pedido-fila').first().click()
  await expect(page.getByTestId('record-header')).toBeVisible()
  await page.waitForTimeout(1500)
  const g = await page.evaluate(() => [...document.querySelectorAll('[data-testid="record-header"] *, [data-testid="shell-sucursal-desktop"], [data-testid="notificaciones-aviso"], [data-testid="shell-tema"]')].filter(n => n.children.length === 0 || n.tagName === 'BUTTON').map(n => { const r = n.getBoundingClientRect(); return `${n.tagName} ${(n.getAttribute('aria-label') || n.dataset.testid || n.textContent.trim()).slice(0, 22)} x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}` }))
  console.log('GEOM>>\n' + g.join('\n'))
  await page.screenshot({ path: process.env.SHOT || '/tmp/geom.png' })
})
