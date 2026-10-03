// #317 — Portal del cliente: en escritorio usa el ancho con dos columnas y una
// columna lateral pegajosa; en móvil mantiene la lectura de siempre.
// Capturas: MOBOS_CAPTURAS=docs/QA-317-portal npx playwright test e2e/qa-317-portal-escritorio.spec.js
import { test, expect } from '@playwright/test'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-317-portal'
const TOKEN = 'demo-demo-cliente-lucia-completo'

test('portal demo: dos columnas en escritorio y una en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/portal/${TOKEN}`)
  await expect(page.getByText('Tus pedidos')).toBeVisible({ timeout: 20_000 })

  const contenedor = page.locator('main > div').first()
  const ancho = await contenedor.evaluate((el) => el.getBoundingClientRect().width)
  expect(ancho, 'el portal aprovecha el ancho en 1440').toBeGreaterThan(900)
  const columnas = await contenedor.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
  expect(columnas, 'dos columnas en escritorio').toBe(2)
  await page.screenshot({ path: `${SHOTS}/escritorio.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByText('Tus pedidos')).toBeVisible({ timeout: 20_000 })
  const anchoMovil = await contenedor.evaluate((el) => el.getBoundingClientRect().width)
  expect(anchoMovil, 'en móvil no se desborda').toBeLessThanOrEqual(390)
  const columnasMovil = await contenedor.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length)
  expect(columnasMovil, 'una sola columna en móvil').toBe(1)
  await page.screenshot({ path: `${SHOTS}/movil.png`, fullPage: true })
})
