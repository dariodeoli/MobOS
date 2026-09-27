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

  test('Inventario: barra única, controles agrupados y métricas con alcance', async ({ page }) => {
    await page.goto('/inventario/unidades')
    await expect(page.getByTestId('inventario-fila').first()).toBeVisible({ timeout: 20_000 })

    const barra = page.getByTestId('barra-inventario')
    await expect(barra).toHaveCount(1)
    // La identidad no se repite: el h1 es del shell y la barra usa h2.
    await expect(barra.getByRole('heading', { level: 2, name: 'Inventario' })).toBeVisible()
    for (const accion of ['+ Recibir unidad', 'Reservar', 'Transferir']) {
      await expect(barra.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }

    const resumen = page.getByTestId('resumen-inventario')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // Totales de la sucursal vs. lo cargado en pantalla, sin mezclarse.
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(3)
    await expect(resumen.getByText('Sucursal', { exact: true })).toHaveCount(1)

    // La consulta va en una fila y las acciones secundarias agrupadas.
    await expect(page.getByLabel('Buscar en inventario')).toBeVisible()
    await expect(page.getByLabel('Orden del inventario')).toBeVisible()
    for (const accion of ['Escanear', 'Conteo rápido', 'Etiquetas de góndola', 'Exportar CSV']) {
      await expect(page.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }

    // Las solapas no repiten contadores (viven en el resumen con alcance).
    await expect(page.getByTestId('tabs-inventario').getByRole('button', { name: /^Inventario \(/ })).toHaveCount(0)
    await expect(page.getByTestId('tabs-inventario').getByRole('button', { name: 'Inventario', exact: true })).toBeVisible()
  })

  test('Productos: barra única, métricas con alcance y controles agrupados', async ({ page }) => {
    await page.goto('/productos')
    await expect(page.getByTestId('producto-fila').first()).toBeVisible({ timeout: 20_000 })

    const barra = page.getByTestId('barra-productos')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByRole('heading', { level: 2, name: 'Productos' })).toBeVisible()
    await expect(barra.getByRole('button', { name: 'Actualizar' })).toBeVisible()

    const resumen = page.getByTestId('resumen-productos')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // El catálogo se carga paginado: todas las métricas declaran su alcance.
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(4)
    await expect(resumen.getByText('Valor a costo')).toBeVisible()

    // Consulta agrupada: búsqueda + categoría + condición + vista.
    await expect(page.getByLabel('Buscar productos')).toBeVisible()
    await expect(page.getByLabel('Filtrar por categoría')).toBeVisible()
    await expect(page.getByLabel('Filtrar por condición')).toBeVisible()
  })

  test('sin desborde horizontal en 390 y 1280', async ({ page }) => {
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const ruta of ['/pos', '/clientes', '/inventario/unidades', '/productos']) {
        await page.goto(ruta)
        await expect(page.getByTestId('shell')).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(600)
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `${ruta} desborda a ${ancho}px`).toBe(false)
      }
    }
  })
})
