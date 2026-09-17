// Role-based navigation: what a seller can and cannot see inside /pos.
// Reads the actual nav logic of PanelVendedor.jsx (SELLER_NAV vs OWNER_NAV),
// SoloPropietario in App.jsx, and the single-redirect vista guard.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

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

  // La auditoría incluye movimientos de equipo y de dinero: un vendedor no
  // puede verla ni por la API.
  test('la auditoría no está disponible para un vendedor', async ({ page }) => {
    await page.goto('/pos/cargar')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    // La API exige el mismo origen de la app, así que la petición sale con el
    // Origin de la página (como en el navegador).
    const respuesta = await page.request.get(`${API}/api/audit`, { headers: { origin: new URL(page.url()).origin } })
    expect(respuesta.status()).toBe(403)
    await page.goto('/pos/historial')
    await expect(page).toHaveURL(/\/pos\/cargar$/)
  })

  test('owner-protected route /control/finanzas redirects the seller to the POS', async ({ page }) => {
    // SoloPropietario in App.jsx bounces non-owners to "/", which lands the
    // seller on /pos/cargar.
    await page.goto('/control/finanzas')
    await expect(page).toHaveURL(/\/pos\/cargar$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  })

  // Fixed in the Phase-3 merge: PanelVendedor.jsx now redirects once
  // (navigate('/pos/cargar', { replace: true })) when the URL points to a
  // vista outside the seller's reach, instead of the old two-effects loop
  // that alternated the header state forever without ever leaving the URL.
  test('direct owner URL /pos/inventario redirects the seller to /pos/cargar once', async ({ page }) => {
    await page.goto('/pos/inventario')

    // Single clean redirect, no loop: the URL leaves the owner view.
    await expect(page).toHaveURL(/\/pos\/cargar$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    // The owner content is never mounted for a seller.
    await expect(page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')).toHaveCount(0)
  })
})
