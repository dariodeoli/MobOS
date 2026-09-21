// #188 (fixes de la QA #185): la demo no ofrece guardados que fallan por falta
// de sesión y la caja demo muestra su apertura de forma coherente.
import { test, expect } from '@playwright/test'

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await expect(page.getByText('Modo demo', { exact: false }).first()).toBeVisible()
}

test.describe('demo de Finanzas', () => {
  test('el seguro queda deshabilitado con nota de demo, sin "Falta sesión"', async ({ page }) => {
    await entrarDemo(page)
    await page.goto('/configuracion/negocio')

    await expect(page.locator('#seguro-toggle')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Guardar seguro' })).toBeDisabled()
    await expect(page.getByText('En la demo no se guardan los límites ni el seguro')).toBeVisible()
    await expect(page.getByText('Falta sesión')).toHaveCount(0)
  })

  test('la caja demo muestra el turno abierto con su apertura', async ({ page }) => {
    await entrarDemo(page)
    await page.goto('/finanzas/caja')

    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin apertura')).toHaveCount(0)
    await expect(page.getByText(/Turno de /)).toBeVisible()
  })
})
