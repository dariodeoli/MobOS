// #332 · Inventario con dos vistas claras y conmutables: Unidades (IMEI/serial)
// y Productos (stock). Reusa el switch de #287 en las dos pantallas, empareja
// las entradas del menú y deja al vendedor su vista de Productos sin el desvío
// a una vista que no puede abrir.
import { test, expect } from '@playwright/test'
import { loginAsSeller } from './helpers/login.js'

test('#332 · el dueño conmuta entre Unidades (IMEI) y Productos (stock), con deep links intactos', async ({ page }) => {
  // La vista de Unidades: unidades físicas con IMEI/serial y el switch.
  await page.goto('/inventario/unidades')
  await expect(page.getByTestId('barra-inventario')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })
  const enUnidades = page.getByTestId('vista-productos-unidades')
  await expect(enUnidades).toBeVisible()
  await expect(enUnidades.getByRole('button', { name: 'Unidades' })).toHaveAttribute('aria-pressed', 'true')

  // Conmutar a la vista normal de Productos.
  await enUnidades.getByRole('button', { name: 'Productos' }).click()
  await expect(page).toHaveURL(/\/productos$/)
  await expect(page.getByTestId('barra-productos')).toBeVisible()
  await expect(page.getByTestId('producto-fila').first()).toBeVisible({ timeout: 20_000 })
  const enProductos = page.getByTestId('vista-productos-unidades')
  await expect(enProductos.getByRole('button', { name: 'Productos' })).toHaveAttribute('aria-pressed', 'true')

  // Y volver a las unidades.
  await enProductos.getByRole('button', { name: 'Unidades' }).click()
  await expect(page).toHaveURL(/\/inventario\/unidades$/)
  await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })

  // El menú ofrece las dos vistas, emparejadas y evidentes.
  const nav = page.locator('aside nav')
  await expect(nav.getByRole('button', { name: 'Unidades (IMEI)', exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Productos (stock)', exact: true })).toBeVisible()
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
