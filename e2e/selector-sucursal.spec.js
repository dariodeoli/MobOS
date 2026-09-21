// Selector de tienda/sucursal del encabezado (issue #58): con una sola
// sucursal se muestra como dato informativo, sin botón ni menú; con varias
// opciones abre un menú real y cambia la sucursal activa.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test.describe('selector de sucursal', () => {
  test('con una sola sucursal es un dato informativo, no un control', async ({ page }) => {
    // El catálogo real puede tener sucursales de otras corridas: se fija una
    // sola para reproducir el caso informativo.
    await page.route('**/api/inventory-branches', async (route) => {
      await route.fulfill({ json: [{ id: 'e2e-branch-unica', name: 'Sucursal Única E2E', city: 'Asunción' }] })
    })
    await page.goto('/pos')

    const info = page.getByTestId('sucursal-info')
    await expect(info).toBeVisible()
    await expect(info).toContainText('Sucursal Única E2E')
    // Sin apariencia de botón ni menú: nada que abrir.
    await expect(info).not.toHaveAttribute('role', 'button')
    await expect(info).not.toHaveAttribute('aria-haspopup', /.*/)
    await expect(page.getByTestId('sucursal-selector')).toHaveCount(0)
  })

  test('con varias sucursales el menú abre y cambia la activa', async ({ page }) => {
    await page.goto('/pos')
    const nombre = `Sucursal selector ${Date.now()}`
    const creada = await api(page, '/api/branches', { method: 'POST', body: JSON.stringify({ name: nombre }) })
    expect(creada.status).toBe(201)

    await page.reload()
    const selector = page.getByTestId('sucursal-selector')
    await expect(selector).toBeVisible()
    await expect(selector).toHaveAttribute('aria-haspopup', 'menu')
    await expect(selector).toHaveAttribute('aria-expanded', 'false')

    await selector.click()
    await expect(selector).toHaveAttribute('aria-expanded', 'true')
    const menu = page.getByTestId('sucursal-menu')
    await expect(menu).toBeVisible()

    const opcion = menu.getByRole('menuitemradio', { name: nombre, exact: true })
    await expect(opcion).toBeVisible()
    await opcion.click()

    await expect(menu).toHaveCount(0)
    await expect(selector).toContainText(nombre)
    await expect(selector).toHaveAttribute('aria-expanded', 'false')

    // La sucursal elegida es el «último usado»: sobrevive a la recarga (#209).
    await page.reload()
    await expect(page.getByTestId('sucursal-selector')).toContainText(nombre)
  })
})
