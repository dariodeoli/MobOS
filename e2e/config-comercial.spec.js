// #253 · Grupo Comercial de Configuración: seguro de ventas, límites y
// autorizaciones, fidelización y mora, y las listas de precios con sus precios
// por cantidad, todo en una sola sección (control/config/Comercial.jsx).
//
// Capturas: `QA_COMERCIAL_CAPTURAS` (default test-results/qa-config-comercial)
// y `QA_COMERCIAL_FASE`. El «antes» sale de producción con
// `node scripts/qa-253-comercial-antes.mjs` (docs/qa/config-comercial/antes).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.QA_COMERCIAL_CAPTURAS || join('test-results', 'qa-config-comercial')
mkdirSync(DIR, { recursive: true })
const capturar = (page, nombre) => page.screenshot({
  path: join(DIR, `config-comercial-${nombre}${process.env.QA_COMERCIAL_FASE ? `-${process.env.QA_COMERCIAL_FASE}` : ''}.png`),
  fullPage: true,
})

test('el grupo Comercial reúne seguro, límites, fidelización y precios', async ({ page }) => {
  await page.goto('/configuracion/comercial')
  await expect(page.getByTestId('config-comercial')).toBeVisible()

  // Los cuatro bloques del grupo (#253), con los precios dentro.
  await expect(page.getByRole('heading', { name: 'Seguro de ventas', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Límites y autorizaciones', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fidelización y mora', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Listas de precios', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Precios por cantidad', exact: true })).toBeVisible()

  for (const id of ['#seguro-toggle', '#seguro-pct', '#limite-gasto', '#limite-compra', '#limite-bajo-lista', '#limite-fidelizacion', '#limite-mora']) {
    await expect(page.locator(id)).toBeAttached()
  }
  await expect(page.getByRole('button', { name: 'Guardar seguro' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar límites' })).toBeVisible()

  // Límites y autorizaciones se cruzan con la bandeja de Operación.
  await expect(page.getByRole('link', { name: /Operación → Autorizaciones/ })).toHaveAttribute('href', '/autorizaciones')

  // Los campos se hidratan con la cuenta y no quedan vacíos.
  await expect(page.locator('#limite-gasto')).not.toHaveValue('', { timeout: 20_000 })
  await expect(page.locator('#limite-bajo-lista')).not.toHaveValue('')
  await capturar(page, 'despues')

  // El deep link viejo de precios entra a la misma sección.
  await page.goto('/configuracion/precios')
  await expect(page).toHaveURL(/\/configuracion\/comercial$/)
  await expect(page.getByRole('heading', { name: 'Listas de precios', exact: true })).toBeVisible()
})

test('el grupo Comercial se ve en mobile sin desborde', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configuracion/comercial')
  await expect(page.getByRole('heading', { name: 'Seguro de ventas', exact: true })).toBeVisible()
  await expect(page.locator('#limite-gasto')).not.toHaveValue('', { timeout: 20_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await capturar(page, 'despues-mobile')
})
