import { clickShellTab, expectShellGroupsVisible, selectInventorySection } from './helpers/shell-navigation.js'
// #256 · Composición compacta: POS y Clientes usan la barra de módulo única
// (identidad + contexto + acciones) y el resumen con alcance explícito. Sin
// encabezados duplicados, sin botones aislados y sin desbordes en mobile.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-256-servicio-taller'

// Alta autenticada desde la página (mismo patrón que los specs de #261/#268:
// la sesión va por cookie con `credentials: 'include'`).
async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: SEED.api, path, options })
}

test.describe('composición compacta', () => {
  test('POS: una sola barra de módulo con el título y las acciones', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Vender', exact: true, level: 1 }).first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-pos')
    await expect(barra).toHaveCount(1)
    // La fecha ya no va en la barra (el shell pone el título): acompaña al
    // resumen de la venta, dentro de «Detalles de la venta y del día».
    await page.getByTestId('pos-detalles').click()
    await expect(page.getByTestId('pos-detalles-popup').getByText(/Fecha: \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('pos-detalles-popup')).toHaveCount(0)
    // Ventas suspendidas y Gift cards son botones de la barra; Analytics y
    // «Más» ya no existen en el POS.
    for (const accion of ['Ventas suspendidas', 'Gift cards']) {
      await expect(barra.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }
    await expect(barra.getByRole('button', { name: 'Analytics', exact: true })).toHaveCount(0)
    await expect(barra.getByTestId('pos-mas')).toHaveCount(0)
  })

  test('Clientes: resumen con alcance explícito y acciones en la barra', async ({ page }) => {
    // Aislamos la composición de los clientes archivados y las altas de otros
    // specs: dos páginas reales del contrato (50 + 1) y un resumen coherente.
    const clientes = Array.from({ length: 51 }, (_, i) => ({ id: `qa256-${i}`, name: `Cliente ${i}`, pricingTier: 'RETAIL' }))
    await page.route('**/api/customers/summary', route => route.fulfill({ json: { total: 51, wholesalers: 0, retail: 51 } }))
    await page.route(/\/api\/customers\?/, route => {
      const params = new URL(route.request().url()).searchParams
      const rows = params.get('q') ? [] : params.has('cursor') ? clientes.slice(50) : clientes.slice(0, 50)
      return route.fulfill({ json: rows })
    })
    await page.goto('/clientes')
    await expect(page.getByTestId('cliente-fila').first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-clientes')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByRole('button', { name: '+ Crear cliente' })).toBeVisible()

    const resumen = page.getByTestId('resumen-clientes')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // #441: una sola línea de KPIs sin subtextos repetidos; el alcance solo se
    // avisa (pista) cuando el listado está filtrado o paginado.
    await expect(resumen.getByText('Tienda', { exact: true })).toHaveCount(0)
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(0)
    const cargarMas = page.getByRole('button', { name: 'Cargar más clientes', exact: true })
    await expect(page.getByTestId('cliente-fila')).toHaveCount(50)
    await expect(cargarMas).toBeVisible()
    await expect(resumen.getByText('Deuda: clientes en pantalla', { exact: true })).toBeVisible()
    await cargarMas.click()
    await expect(page.getByTestId('cliente-fila')).toHaveCount(51)
    await expect(cargarMas).toHaveCount(0)
    await expect(resumen.getByText(/en pantalla$/)).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Buscar clientes', exact: true }).fill('QA256_SCOPE')
    await expect(resumen.getByText('Deuda: clientes en pantalla', { exact: true })).toBeVisible()
  })

  test('Inventario: barra única con buscador, filtros y acciones agrupadas', async ({ page }) => {
    await page.goto('/stock/unidades')
    await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })

    const barra = page.getByTestId('barra-inventario')
    await expect(barra).toHaveCount(1)
    // #320: la identidad visible es una sola (el h1 del shell); la barra no
    // repite el título: agrupa contexto y acciones.
    await expect(barra.getByRole('heading')).toHaveCount(0)
    await expect(barra.getByRole('group', { name: 'Acciones de Stock' })).toHaveCount(1)
    // #305: buscador y filtros viven en la barra, con la acción primaria.
    await expect(barra.getByTestId('filtros-stock')).toBeVisible()
    await expect(barra.getByLabel('Buscar en inventario')).toBeVisible()
    await expect(barra.getByRole('button', { name: '+ Recibir unidad', exact: true })).toBeVisible()

    // Las acciones secundarias ya no se apilan: viven en «Más».
    await expect(page.getByTestId('resumen-inventario')).toHaveCount(0)
    for (const accion of ['Escanear', 'Conteo rápido', 'Reservar', 'Transferir', 'Etiquetas de góndola']) {
      await expect(page.getByRole('button', { name: accion, exact: true })).toHaveCount(0)
    }
    await barra.getByRole('button', { name: 'Más', exact: true }).click()
    const menu = page.getByRole('menu', { name: 'Más acciones de inventario' })
    for (const accion of ['Escanear', 'Conteo rápido', 'Etiquetas de góndola', 'Reservar', 'Transferir']) {
      await expect(menu.getByRole('menuitem', { name: accion })).toBeVisible()
    }
    await page.keyboard.press('Escape')

    // #305/U3 + rediseño 2A: navegación agrupada en pestañas del shell (Unidades ·
    // Productos · Traslados · Control · Precios), con las vistas de cada pestaña
    // como segundo nivel en su barra. En escritorio con el menú expandido las
    // pestañas son el submenú lateral de Stock.
    await expectShellGroupsVisible(page, ['unidades', 'productos', 'traslados', 'control', 'precios'])
    await expect(page.getByTestId('subtabs-inventario').getByRole('tab', { name: 'En tránsito', exact: true })).toHaveCount(0)
    await clickShellTab(page, 'shell-contexto', 'traslados')
    await expect(page.getByTestId('subtabs-inventario').getByRole('tab', { name: 'En tránsito', exact: true })).toBeVisible()
    await clickShellTab(page, 'shell-contexto', 'control')
    await expect(page.getByTestId('subtabs-inventario').getByRole('tab', { name: 'Conteos', exact: true })).toBeVisible()
    for (const value of ['reservas', 'transito', 'conteos', 'unidades']) await selectInventorySection(page, value)

  })

  test('Productos: barra única, métricas con alcance y controles agrupados', async ({ page }) => {
    await page.goto('/productos')
    await expect(page.getByTestId('producto-fila').first()).toBeVisible({ timeout: 20_000 })

    const barra = page.getByTestId('barra-productos')
    await expect(barra).toHaveCount(1)
    // #320: la identidad visible es una sola (el h1 del shell); la barra no
    // repite el título: agrupa contexto y acciones.
    await expect(barra.getByRole('heading')).toHaveCount(0)
    await expect(barra).toHaveAttribute('aria-label', 'Productos')
    await expect(barra.getByRole('button', { name: 'Actualizar' })).toBeVisible()

    const resumen = page.getByTestId('resumen-productos')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // El catálogo se carga paginado: todas las métricas comparten el alcance y
    // la tira lo declara una sola vez.
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(1)
    await expect(resumen.getByText('Valor a costo')).toBeVisible()

    // Consulta agrupada: búsqueda + categoría + condición + vista.
    await expect(page.getByLabel('Buscar productos')).toBeVisible()
    await expect(page.getByLabel('Filtrar por categoría')).toBeVisible()
    await expect(page.getByLabel('Filtrar por condición')).toBeVisible()
  })

  test('Compras: barra única, métricas con alcance y búsqueda agrupada', async ({ page }) => {
    await page.goto('/compras')
    await expect(page.getByTestId('barra-compras')).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-compras')
    // #320: la identidad visible es una sola (el h1 del shell); la barra no
    // repite el título: agrupa contexto y acciones.
    await expect(barra.getByRole('heading')).toHaveCount(0)
    // #388: el nombre accesible lo lleva el grupo de la barra (Toolbar), no su envoltorio.
    await expect(barra.getByRole('group', { name: 'Compras', exact: true })).toBeVisible()
    for (const accion of ['Proveedores', 'Exportar CSV']) {
      await expect(barra.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }
    await expect(page.getByLabel('Buscar compras')).toBeVisible()
    const resumen = page.getByTestId('resumen-compras')
    if (await resumen.count()) {
      await expect(resumen.locator('> div')).toHaveCount(4)
      // Mismo alcance en todas las métricas: se declara una vez para la tira.
      await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(1)
    }
  })

  test('sin desborde horizontal en 390 y 1280', async ({ page }) => {
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const ruta of ['/pos', '/clientes', '/inventario/unidades', '/productos', '/compras']) {
        await page.goto(ruta)
        await expect(page.getByTestId('shell')).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(600)
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `${ruta} desborda a ${ancho}px`).toBe(false)
      }
    }
  })
})
