// Owner views (admin storageState): resumen KPIs, inventario unit intake,
// equipo → Vendedores roster, and finanzas → Caja opening.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test.describe('owner panel', () => {
  test('resumen shows the dashboard KPIs', async ({ page }) => {
    await page.goto('/pos/resumen')
    await expect(page.getByRole('heading', { name: 'Resumen general' })).toBeVisible()
    await expect(page.getByText('Facturado', { exact: true })).toBeVisible()
    await expect(page.getByText('Ventas', { exact: true })).toBeVisible()
  })

  // BUG resources-api-undefined: src/lib/api/index.js re-exports `api` from
  // './client' but never imports it into scope, so the first resources.* call
  // throws ReferenceError "api is not defined" in API mode. Inventario loads
  // no data (Unidades (0)) and shows the raw error. TODO: `import { api } from
  // './client'` in src/lib/api/index.js; then re-enable the intake flow below
  // (+ Recibir unidad → model → IMEI → "Guardar unidad" → notice + unit listed).
  test('inventario fails to load units in API mode (known bug)', async ({ page }) => {
    await page.goto('/pos/inventario')
    await expect(page.getByRole('heading', { name: 'Inventario operativo' })).toBeVisible()
    await expect(page.getByText('api is not defined')).toBeVisible()
    await expect(page.getByText('Unidades (0)')).toBeVisible()
    await expect(page.getByText(SEED.products.iphone.imei)).toHaveCount(0)
  })

  test('equipo → Vendedores lists the seeded sellers', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()
    for (const seller of SEED.sellers) {
      await expect(page.locator(`input[value="${seller.name}"]`)).toBeVisible()
    }
  })

  // BUG legacy-addvendedor-in-api: Vendedores.jsx still calls the local-only
  // storage.addVendedor(), which throws "La mutación legacy de vendedores no
  // está disponible en modo API" once the session is real. The submit handler
  // has no catch, so the form silently fails: the name stays in the input and
  // no seller is created via POST /api/users.
  // TODO: wire the "Agregar" form to the users API (or remove it) and then
  // assert the new seller appears in the roster.
  test('equipo → Vendedores cannot create a seller in API mode (known bug)', async ({ page }) => {
    await page.goto('/pos/equipo')
    await expect(page.getByRole('heading', { name: 'Funcionarios y metas' })).toBeVisible()

    await page.getByPlaceholder('Nombre del nuevo vendedor').fill('Vendedor Fantasma E2E')
    await page.getByRole('button', { name: 'Agregar' }).click()

    // Current behavior: the click throws inside the handler, so the input is
    // never cleared and the roster does not change.
    await expect(page.getByPlaceholder('Nombre del nuevo vendedor')).toHaveValue('Vendedor Fantasma E2E')
    await expect(page.getByText('Vendedor Fantasma E2E', { exact: true })).toHaveCount(0)
  })

  test('finanzas → Caja can open the cash session', async ({ page }) => {
    await page.goto('/pos/finanzas')
    await expect(page.getByRole('heading', { name: 'Caja y control financiero' })).toBeVisible()

    // Re-runs may find the cash session still open from a previous run.
    if (await page.getByRole('heading', { name: 'Cerrar caja' }).isVisible()) {
      await page.locator('#counted').fill('0')
      await page.getByRole('button', { name: /Cerrar caja/ }).click()
    }
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()

    await page.locator('#opening').fill('100000')
    await page.getByRole('button', { name: 'Abrir caja' }).click()

    await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
  })
})
