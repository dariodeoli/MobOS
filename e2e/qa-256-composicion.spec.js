// #256 · Composición compacta: POS y Clientes usan la barra de módulo única
// (identidad + contexto + acciones) y el resumen con alcance explícito. Sin
// encabezados duplicados, sin botones aislados y sin desbordes en mobile.
import { test, expect } from '@playwright/test'

test.describe('composición compacta', () => {
  test('POS: una sola barra de módulo con el título y las acciones', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' }).first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-pos')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByText(/Hoy: \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    for (const accion of ['Analytics', 'Ventas suspendidas']) {
      await expect(barra.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }
  })

  test('Clientes: resumen con alcance explícito y acciones en la barra', async ({ page }) => {
    await page.goto('/clientes')
    await expect(page.getByTestId('cliente-fila').first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-clientes')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByRole('button', { name: '+ Crear cliente' })).toBeVisible()

    const resumen = page.getByTestId('resumen-clientes')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // Los totales del negocio y los de la pantalla no se mezclan: cada tile
    // declara su alcance.
    await expect(resumen.getByText('Tienda', { exact: true })).toHaveCount(2)
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(2)
    await expect(resumen.getByText(/en pantalla$/)).toHaveCount(1)
  })

  test('secundarias: barra de módulo y sin desborde en 390/1280', async ({ page }) => {
    test.setTimeout(120_000)
    const PANTALLAS = [
      ['/productos', 'barra-productos', 'Productos'],
      ['/promociones', 'barra-promociones', 'Promociones'],
      ['/cotizaciones', 'barra-cotizaciones', 'Cotizaciones'],
      ['/plantillas', 'barra-plantillas', 'Plantillas'],
      ['/pedidos', 'barra-pedidos', 'Pedidos'],
      ['/delivery', 'barra-delivery', 'Delivery'],
      // /trade-in no va acá: el dueño ve el pipeline (admin) y el cotizador con
      // barra es la vista del vendedor; la cubre la regla de objetos.
    ]
    for (const [ancho, alto] of [[1280, 900], [390, 844]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const [ruta, testId, titulo] of PANTALLAS) {
        await page.goto(ruta)
        // El panel mantiene vistas montadas con `hidden`: se apunta a la visible.
        const barra = page.locator(`[data-testid="${testId}"]:visible`)
        await expect(barra, `${ruta}: barra de módulo`).toBeVisible({ timeout: 20_000 })
        await expect(barra.getByRole('heading', { name: titulo })).toBeVisible()
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `${ruta} desborda a ${ancho}px`).toBe(false)
      }
    }
    // Pedidos resume su lista con alcance explícito.
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/pedidos')
    const resumen = page.getByTestId('resumen-pedidos')
    await expect(resumen).toBeVisible({ timeout: 20_000 })
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(3)
  })

  test('sin desborde horizontal en 390 y 1280', async ({ page }) => {
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const ruta of ['/pos', '/clientes']) {
        await page.goto(ruta)
        await expect(page.getByTestId('shell')).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(600)
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `${ruta} desborda a ${ancho}px`).toBe(false)
      }
    }
  })
})
