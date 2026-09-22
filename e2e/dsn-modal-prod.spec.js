// Capturas "después" de los modales principales en PRODUCCIÓN (#237), sobre el
// estándar de `shared/modal.js` ya desplegado. Temporal.
import { test, expect } from '@playwright/test'

const APP = 'https://app.moboss.online'
const SHOTS = '/tmp/mobos-qa-dsn'

test('modales principales en producción (después)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${APP}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await expect(page.getByTestId('menu-acciones')).toBeVisible({ timeout: 30_000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})

  // 1) POS · Analytics
  await page.goto(`${APP}/pos`)
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible({ timeout: 25_000 })
  await page.getByRole('button', { name: 'Analytics' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const anchoAnalytics = await page.getByRole('dialog').evaluate((el) => Math.round(el.getBoundingClientRect().width))
  await page.screenshot({ path: `${SHOTS}/c237-analytics-despues.png` })
  await page.keyboard.press('Escape')

  // 2) POS · Ventas suspendidas
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const anchoSuspendidas = await page.getByRole('dialog').evaluate((el) => Math.round(el.getBoundingClientRect().width))
  await page.screenshot({ path: `${SHOTS}/c237-suspendidas-despues.png` })
  await page.keyboard.press('Escape')

  console.log(`[prod-modales] analytics=${anchoAnalytics}px · suspendidas=${anchoSuspendidas}px`)
})
