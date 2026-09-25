// IA del menú (#251): ocho grupos por flujo de trabajo (Inicio · Vender ·
// Clientes · Inventario · Operación · Finanzas · Análisis · Configuración), las
// herramientas adentro de su sección (Promociones/Plantillas en Vender, Precios
// y la lista por modelo/comparador en Inventario, Autorizaciones y el tablero
// en Operación), «Taller» como sección única con pestañas internas y rutas
// heredadas que siguen abriendo su pantalla sin mostrarse como navegación.
import { test, expect } from '@playwright/test'

const GRUPOS = ['Inicio', 'Vender', 'Clientes', 'Inventario', 'Operación', 'Finanzas', 'Análisis', 'Configuración']

// El proyecto admin corre con la sesión del dueño ya guardada (storageState).
async function entrarComoDueno(page) {
  await page.goto('/resumen')
  await expect(page).toHaveURL(/\/resumen$/)
  await expect(page.locator('h1')).toHaveText('Inicio')
}

const grupos = (page) => page.locator('aside nav > div')
const nav = (page) => page.locator('aside nav')

test('el dueño ve los ocho grupos de la IA con las herramientas dentro de su sección (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  // Grupos en orden (los toggles llevan aria-expanded; los ítems no).
  await expect(nav(page).locator('button[aria-expanded]')).toHaveText(GRUPOS)
  await expect(grupos(page)).toHaveCount(8)

  // Vender: POS, Pedidos, Cotizaciones + Promociones y Plantillas (adentro).
  const vender = grupos(page).nth(1)
  for (const label of ['POS', 'Pedidos', 'Cotizaciones', 'Promociones', 'Plantillas']) {
    await expect(vender.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // Clientes como sección propia.
  await expect(grupos(page).nth(2).locator('button[aria-label="Clientes"]')).toBeVisible()

  // Inventario: catálogo, stock, compras, traslados y las herramientas de
  // precios (Precios, Lista por modelo y Comparador dejan de estar ocultos).
  const inventario = grupos(page).nth(3)
  for (const label of ['Productos', 'Unidades', 'Compras', 'Traslados y tránsito', 'Precios', 'Lista por modelo', 'Comparador']) {
    await expect(inventario.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // Operación: Delivery, Taller y garantías, Trade-In, Autorizaciones y el
  // tablero real del dueño.
  const operacion = grupos(page).nth(4)
  for (const label of ['Delivery', 'Taller y garantías', 'Trade-In', 'Autorizaciones', 'Tablero de operaciones']) {
    await expect(operacion.getByRole('button', { name: label, exact: true })).toBeVisible()
  }

  // Ningún grupo se llama como las herramientas movidas: no hay duplicados ni
  // rutas de compatibilidad visibles.
  for (const label of ['Promociones', 'Precios', 'Plantillas', 'Autorizaciones', 'Servicio y Garantías', 'Listas de precios', 'Herramientas', 'Operación y stock']) {
    await expect(nav(page).locator('button[aria-expanded]').filter({ hasText: label })).toHaveCount(0)
  }
})

test('el tablero real (/ops) y las herramientas de precios se abren desde el menú (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  await nav(page).getByRole('button', { name: 'Tablero de operaciones', exact: true }).click()
  await expect(page).toHaveURL(/\/ops$/)
  await expect(page.getByRole('heading', { name: 'Tablero de operaciones' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Volver a la app/ })).toBeVisible()

  // Lista por modelo y comparador viven en Inventario.
  await page.goto('/resumen')
  await nav(page).getByRole('button', { name: 'Lista por modelo', exact: true }).click()
  await expect(page).toHaveURL(/\/celulares$/)
  await expect(page.locator('h1')).toHaveText('Lista por modelo')
  await nav(page).getByRole('button', { name: 'Comparador', exact: true }).click()
  await expect(page).toHaveURL(/\/comparador$/)
})

test('«Taller» es una sola sección con pestañas y /garantias abre la suya (#251)', async ({ page }) => {
  await entrarComoDueno(page)

  await nav(page).getByRole('button', { name: 'Taller y garantías', exact: true }).click()
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
    ['/configuracion/precios', 'Precios'],
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
