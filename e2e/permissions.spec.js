// Role-based navigation: what a seller can and cannot see inside the panel.
// Reads the actual nav logic of PanelVendedor.jsx (SELLER_NAV vs OWNER_NAV),
// SoloPropietario in App.jsx, and the single-redirect vista guard.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test.describe('seller permissions', () => {
  test('owner-only nav items are not visible to a seller', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    const sidebarNav = page.locator('aside nav')
    // Menú del vendedor (IA #251): cuatro grupos y solo sus módulos.
    await expect(sidebarNav.locator('button[aria-expanded]')).toHaveText(['Vender', 'Clientes', 'Inventario', 'Operación'])
    for (const label of ['POS', 'Mis pedidos', 'Cotizaciones', 'Promociones', 'Plantillas', 'Productos', 'Precios', 'Delivery', 'Trade-In']) {
      await expect(sidebarNav.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    // Módulos del dueño que el vendedor no ve.
    for (const label of ['Inicio', 'Pedidos', 'Unidades', 'Compras', 'Traslados y tránsito', 'Lista por modelo', 'Comparador', 'Taller y garantías', 'Autorizaciones', 'Tablero de operaciones', 'Finanzas', 'Análisis', 'Configuración']) {
      await expect(sidebarNav.getByRole('button', { name: label, exact: true })).toHaveCount(0)
    }
  })

  // La auditoría incluye movimientos de equipo y de dinero: un vendedor no
  // puede verla ni por la API.
  test('la auditoría no está disponible para un vendedor', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
    // La API exige el mismo origen de la app, así que la petición sale con el
    // Origin de la página (como en el navegador).
    const respuesta = await page.request.get(`${API}/api/audit`, { headers: { origin: new URL(page.url()).origin } })
    expect(respuesta.status()).toBe(403)
    await page.goto('/configuracion/historial')
    await expect(page).toHaveURL(/\/pos$/)
  })

  test('owner-protected route /control/finanzas redirects the seller to the POS', async ({ page }) => {
    // SoloPropietario in App.jsx bounces non-owners to "/", which lands the
    // seller on /pos.
    await page.goto('/control/finanzas')
    await expect(page).toHaveURL(/\/pos$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()
  })

  // Marketing (cobranzas por WhatsApp, segmentos y campañas) es de
  // administración y gerencia: el vendedor no ve el acceso ni puede pegarle a
  // la API (#81, #82).
  test('el marketing y las cobranzas por WhatsApp no están para un vendedor', async ({ page }) => {
    await page.goto('/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Campañas' })).toHaveCount(0)

    for (const path of ['/api/collections/reminders', '/api/customers/segments?segment=INACTIVE', '/api/marketing/campaigns']) {
      const respuesta = await page.request.get(`${API}${path}`, { headers: { origin: new URL(page.url()).origin } })
      expect(respuesta.status(), `${path} debe estar vedado para el vendedor`).toBe(403)
    }
  })

  // Fixed in the Phase-3 merge: PanelVendedor.jsx now redirects once
  // (navigate('/pos', { replace: true })) when the URL points to a
  // vista outside the seller's reach, instead of the old two-effects loop
  // that alternated the header state forever without ever leaving the URL.
  test('direct owner URL /inventario redirects the seller to /pos once', async ({ page }) => {
    await page.goto('/inventario')

    // Single clean redirect, no loop: the URL leaves the owner view.
    await expect(page).toHaveURL(/\/pos$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    // The owner content is never mounted for a seller.
    await expect(page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')).toHaveCount(0)
  })

  // Los enlaces guardados de la era /pos/* siguen funcionando (#116).
  test('las URLs viejas /pos/* y /tradein redirigen a los slugs nuevos', async ({ page }) => {
    await page.goto('/pos/cargar')
    await expect(page).toHaveURL(/\/pos$/)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

    await page.goto('/pos/pedidos')
    await expect(page).toHaveURL(/\/pedidos$/)

    // La query se conserva al redirigir.
    await page.goto('/pos/clientes?cliente=abc')
    await expect(page).toHaveURL(/\/clientes\?cliente=abc$/)

    await page.goto('/pos/cotizador')
    await expect(page).toHaveURL(/\/trade-in$/)

    await page.goto('/tradein')
    await expect(page).toHaveURL(/\/trade-in$/)

    // Vista de dueño: el vendedor vuelve a su lugar, en una sola cadena.
    await page.goto('/pos/inventario')
    await expect(page).toHaveURL(/\/pos$/)
  })
})
