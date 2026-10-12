import { openShellDestination, shellCatalog } from './helpers/shell-navigation.js'
// IA del menú (#251): ocho grupos por flujo de trabajo (Inicio · Vender ·
// Clientes · Inventario · Operación · Finanzas · Análisis · Configuración), las
// herramientas adentro de su sección (Promociones/Plantillas en Vender, Precios
// y la lista por modelo/comparador en Inventario, Autorizaciones y el tablero
// en Operación), «Taller» como sección única con pestañas internas y rutas
// heredadas que siguen abriendo su pantalla sin mostrarse como navegación.
import { test, expect } from '@playwright/test'

// El proyecto admin corre con la sesión del dueño ya guardada (storageState).
async function entrarComoDueno(page) {
  await page.goto('/resumen')
  await expect(page).toHaveURL(/\/resumen$/)
  await expect(page.locator('h1')).toHaveText('Inicio')
}

test('el dueño ve cinco secciones y conserva todas sus herramientas (#251)', async ({ page }) => {
  await entrarComoDueno(page)
  const catalog = await shellCatalog(page)
  expect(catalog.primary).toEqual(['Inicio', 'Vender', 'Ventas', 'Stock', 'Finanzas'])
  for (const label of ['Nueva venta', 'Pedidos', 'Cotizaciones', 'Promociones', 'Plantillas', 'Clientes', 'Productos (stock)', 'Unidades (IMEI)', 'Compras', 'Traslados y tránsito', 'Precios', 'Lista por modelo', 'Comparador', 'Delivery', 'Taller y garantías', 'Trade-In', 'Autorizaciones', 'Tablero de operaciones']) {
    expect(catalog.destinations).toContain(label)
  }
  expect(catalog.profile).toContain('Configuración')
  for (const label of ['Promociones', 'Precios', 'Plantillas', 'Autorizaciones', 'Servicio y Garantías', 'Listas de precios', 'Herramientas', 'Operación y stock']) {
    expect(catalog.primary).not.toContain(label)
  }
})

test('el tablero real (/ops) y las herramientas de precios se abren desde el menú (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  await openShellDestination(page, 'Tablero de operaciones')
  await expect(page).toHaveURL(/\/ops$/)
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Volver a la app/ })).toBeVisible()

  // Lista por modelo y comparador viven en Inventario.
  await page.goto('/resumen')
  await openShellDestination(page, 'Lista por modelo')
  await expect(page).toHaveURL(/\/celulares$/)
  await expect(page.locator('h1')).toHaveText('Lista por modelo')
  await openShellDestination(page, 'Comparador')
  await expect(page).toHaveURL(/\/comparador$/)
})

test('«Taller» es una sola sección con pestañas y /garantias abre la suya (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  await openShellDestination(page, 'Taller y garantías')
  await expect(page).toHaveURL(/\/servicio$/)
  await expect(page.locator('h1')).toHaveText('Taller')
  const pestanas = page.getByRole('group', { name: 'Ver taller o garantías' })
  for (const label of ['Todo', 'Tablero', 'Servicio', 'Garantías']) {
    await expect(pestanas.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // La ruta vieja /garantias entra a la sección con su pestaña activa.
  await page.goto('/garantias')
  await expect(page.locator('h1')).toHaveText('Taller')
  await expect(pestanas.getByRole('button', { name: 'Garantías', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('las rutas heredadas siguen abriendo su pantalla sin figurar en el menú (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  const heredadas = [
    ['/promociones', 'Promociones'],
    ['/precios', 'Precios'],
    ['/configuracion/precios', 'Comercial'],
    ['/plantillas', 'Plantillas de WhatsApp'],
    ['/autorizaciones', 'Autorizaciones'],
    ['/celulares', 'Lista por modelo'],
    ['/comparador', 'Comparador'],
  ]
  for (const [ruta, titulo] of heredadas) {
    await page.goto(ruta)
    await expect(page.locator('h1'), `${ruta} debe mostrar «${titulo}»`).toHaveText(titulo, { timeout: 15_000 })
  }
})
