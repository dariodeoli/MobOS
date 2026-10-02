// #316 — Trade-In: el detalle sale de la página y vive en un panel con
// encabezado real (modelo, estado, valores); el alta de valor de toma es un
// modal y no empuja el listado.
// Capturas: MOBOS_CAPTURAS=docs/QA-316-tradein npx playwright test e2e/qa-316-tradein.spec.js
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-316-tradein'

async function abrirDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await page.getByTestId('shell-lateral').waitFor({ timeout: 30_000, state: 'attached' })
  await cerrarGuiaDemo(page, { timeout: 8000 })
}

test('trade-in demo: detalle en panel, sin empujar la lista', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)
  await page.goto('/trade-in')
  await expect(page.getByTestId('tradein-tabla')).toBeVisible({ timeout: 20_000 })
  const filas = page.getByTestId('tradein-fila')
  await expect(filas.first()).toBeVisible()
  const antes = await filas.first().boundingBox()

  // El detalle ya no se expande debajo de la fila: se abre en un panel.
  await filas.first().click()
  const detalle = page.getByTestId('tradein-detalle')
  await expect(detalle).toBeVisible()
  await expect(detalle.getByText('Valor de toma')).toBeVisible()
  const despues = await filas.first().boundingBox()
  expect(despues.y).toBeCloseTo(antes.y, 0)
  expect((await filas.first().innerText()).includes('Serial / IMEI')).toBe(false)
  await page.screenshot({ path: `${SHOTS}/claro-01-detalle.png` })

  // El panel se cierra con Escape y deja la página como estaba.
  await page.keyboard.press('Escape')
  await expect(detalle).toBeHidden()
  expect((await filas.first().boundingBox()).y).toBeCloseTo(antes.y, 0)

  // El alta de valor de toma se abre en modal (con acciones visibles).
  await page.getByRole('button', { name: 'Añadir valor' }).click()
  const modal = page.getByRole('dialog', { name: 'Nuevo valor de toma' })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Guardar valor' })).toBeInViewport()
  await page.screenshot({ path: `${SHOTS}/claro-02-valor.png` })
})

test('trade-in demo: el panel también entra en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page)
  await page.goto('/trade-in')
  await expect(page.getByTestId('tradein-tabla')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('tradein-fila').first().click()
  await expect(page.getByTestId('tradein-detalle')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/movil-01-detalle.png` })
})
