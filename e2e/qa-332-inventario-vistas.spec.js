import { clickShellTab, shellCatalog } from './helpers/shell-navigation.js'
// #332 · Inventario con dos vistas claras y conmutables: Unidades (IMEI/serial)
// y Productos (stock). Rediseño 2A: son pestañas del shell (Unidades · Productos),
// el switch de #287 queda en Productos; se empareja la navegación y se deja al
// vendedor su vista de Productos sin el desvío a una vista que no puede abrir.
import { test, expect } from '@playwright/test'
import { loginAsSeller } from './helpers/login.js'

test('#332 · el dueño conmuta entre Unidades (IMEI) y Productos (stock), con deep links intactos', async ({ page }) => {
  // La vista de Unidades: unidades físicas con IMEI/serial; Unidades y Productos son pestañas del shell.
  await page.goto('/inventario/unidades')
  await expect(page.getByTestId('barra-inventario')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
  const contexto = page.getByTestId('shell-contexto')
  await expect(contexto.locator('[data-tab-id="unidades"]')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('vista-productos-unidades')).toHaveCount(0)

  // Conmutar a la vista normal de Productos.
  await clickShellTab(page, 'shell-contexto', 'productos')
  await expect(page).toHaveURL(/\/productos$/)
  await expect(page.getByTestId('barra-productos')).toBeVisible()
  await expect(page.getByTestId('producto-fila').first()).toBeVisible({ timeout: 20_000 })
  const enProductos = page.getByTestId('vista-productos-unidades')
  await expect(enProductos.getByRole('button', { name: 'Productos' })).toHaveAttribute('aria-pressed', 'true')

  // Y volver a las unidades.
  await enProductos.getByRole('button', { name: 'Unidades' }).click()
  await expect(page).toHaveURL(/\/stock\/unidades$/)
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })

  // El menú ofrece las dos vistas, emparejadas y evidentes.
  const catalog = await shellCatalog(page)
  expect(catalog.destinations).toContain('Unidades (IMEI)')
  expect(catalog.destinations).toContain('Productos (stock)')
})

test('#332 · el vendedor conserva Productos sin el switch de Unidades y sin acceso a esa vista', async ({ browser }) => {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const vendedor = await contexto.newPage()
  await loginAsSeller(vendedor)

  // Su vista normal sigue igual y no le aparece un switch que lo rebote.
  await vendedor.goto('/productos')
  await expect(vendedor.getByTestId('barra-productos')).toBeVisible({ timeout: 20_000 })
  await expect(vendedor.getByTestId('vista-productos-unidades')).toHaveCount(0)

  // La vista de Unidades sigue siendo del dueño/gerencia: vuelve al POS.
  await vendedor.goto('/inventario/unidades')
  await expect(vendedor).toHaveURL(/\/pos$/, { timeout: 15_000 })

  await contexto.close()
})
