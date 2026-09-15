// Role-based navigation: what a seller can and cannot see inside /pos.
// Reads the actual nav logic of PanelVendedor.jsx (SELLER_NAV vs OWNER_NAV)
// and SoloPropietario in App.jsx.

import { test, expect } from '@playwright/test'

test.describe('seller permissions', () => {
  test('owner-only nav items are not visible to a seller', async ({ page }) => {
    await page.goto('/pos/cargar')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    const sidebarNav = page.locator('aside nav')
    // Seller nav (SELLER_NAV): these are visible.
    for (const label of ['Cargar venta', 'Clientes', 'Mis pedidos', 'Productos', 'Promociones', 'Trade-In']) {
      await expect(sidebarNav.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    // Owner-only nav (OWNER_NAV): not rendered for sellers.
    for (const label of ['Inventario', 'Compras', 'Garantías y servicio', 'Resumen', 'Análisis', 'Finanzas', 'Equipo y configuración']) {
      await expect(sidebarNav.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    }
  })

  test('owner-protected route /control/finanzas redirects the seller to the POS', async ({ page }) => {
    // SoloPropietario in App.jsx bounces non-owners to "/", which lands the
    // seller on /pos/cargar.
    await page.goto('/control/finanzas')
    await expect(page).toHaveURL(/\/pos\/cargar$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  })

  // BUG pos-vista-loop-seller: PanelVendedor.jsx keeps two competing effects:
  // one resets an inaccessible routeVista to "cargar", the other restores
  // routeVista whenever it differs from the current vista. For a seller on
  // /pos/inventario the state alternates forever (header flips between
  // "Cargar venta" and "Inventario", no crash) and the URL never redirects.
  // Expected: a single redirect to /pos/cargar, like the ir() guard does.
  // TODO: converge the vista state (navigate away or derive vista from an
  // access check) instead of fighting between the two effects.
  test('direct owner URL /pos/inventario loops the seller panel instead of redirecting (known bug)', async ({ page }) => {
    await page.goto('/pos/inventario')
    await page.waitForTimeout(1500)

    // The URL never leaves the owner view: no redirect happens.
    expect(new URL(page.url()).pathname).toBe('/pos/inventario')

    // Evidence of the live update loop: the header label flips between the
    // two vistas while the effects keep re-scheduling each other.
    const samples = []
    for (let i = 0; i < 12; i++) {
      samples.push(await page.evaluate(() => document.querySelector('header span.text-lg')?.textContent || ''))
      await page.waitForTimeout(200)
    }
    expect(samples.some((s) => s.includes('Cargar venta')), 'checkout vista must appear in the loop').toBe(true)
    expect(samples.some((s) => s.includes('Inventario')), 'owner vista must appear in the loop (it should never render)').toBe(true)

    // The owner content never stays mounted.
    await expect(page.getByText('Escanear IMEI, SKU o buscar modelo')).toHaveCount(0)
  })
})
