import { openShellDestination, shellCatalog } from './helpers/shell-navigation.js'
// #303 · Centro de Control: se llega desde el menú, la búsqueda global y los
// enlaces contextuales de Lista por modelo y Comparador; desde ahí se cargan
// los precios y las fotos que alimentan esas dos pantallas.
// Corre en el demo anónimo del Dueño. Evidencia en docs/qa/303-centro-control/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo, silenciarAvisoMetricas } from './helpers/demo.js'

test.beforeEach(({ page }) => silenciarAvisoMetricas(page))

const DIR = join('docs', 'qa', '303-centro-control')
const FOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

test('#303 · el Centro de Control se llega desde el menú, la búsqueda y las dos pantallas', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarDemo(page)

  // 1) Navegación: la entrada existe en el grupo Inventario.
  const catalog = await shellCatalog(page)
  expect(catalog.destinations).toContain('Centro de Control')
  await openShellDestination(page, 'Centro de Control')
  await expect(page).toHaveURL(/\/centro-control$/)
  await expect(page.getByTestId('barra-centro-control')).toBeVisible()
  await expect(page).toHaveTitle('Centro de Control · MobOS')
  await page.screenshot({ path: join(DIR, 'centro-celulares-1280-light.png') })

  // 2) Desde Lista por modelo se llega por la sub-navegación (no hay botón duplicado).
  await openShellDestination(page, 'Lista por modelo')
  await expect(page).toHaveURL(/\/celulares$/)
  await expect(page.getByTestId('ir-centro-control')).toHaveCount(0)
  await page.locator('[data-testid="shell-subcontexto"] [data-tab-id="centro-control"], [data-slot="view"] [data-tab-id="centro-control"]').first().click()
  await expect(page).toHaveURL(/\/centro-control$/)

  // 3) Desde Comparador, por la sub-navegación, y luego la sección Imágenes.
  await openShellDestination(page, 'Comparador')
  await expect(page).toHaveURL(/\/comparador$/)
  await page.locator('[data-slot="view"] [data-tab-id="centro-control"]').first().click()
  await expect(page).toHaveURL(/\/centro-control$/)
  await page.getByRole('tab', { name: 'Imágenes' }).click()
  await expect(page).toHaveURL(/\/centro-control\?seccion=imagenes$/)
  await expect(page.getByTestId('centro-imagenes')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'centro-imagenes-1280-light.png') })

  // 4) Búsqueda global: «centro» ofrece el acceso y navega.
  await page.getByTestId('shell-buscar').click()
  const paleta = page.getByRole('dialog', { name: 'Búsqueda global' })
  await expect(paleta).toBeVisible()
  await paleta.getByRole('combobox').fill('centro')
  const resultado = paleta.getByText('Centro de Control', { exact: true })
  await expect(resultado).toBeVisible({ timeout: 10_000 })
  await resultado.click()
  await expect(page).toHaveURL(/\/centro-control$/)
  await expect(page.getByTestId('barra-centro-control')).toBeVisible()
})

test('#303 · la lista cargada alimenta Lista por modelo y Comparador', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarDemo(page)

  // El demo ya trae el catálogo ficticio: la pantalla no está vacía.
  await page.goto('/celulares')
  await expect(page.getByText('Todavía no hay precios cargados')).toHaveCount(0)
  // La lista por modelo es ahora el documento premium en una vista previa (iframe).
  await expect(page.frameLocator('iframe').getByText('iPhone 15 Pro', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: join(DIR, 'lista-por-modelo-1280-light.png') })

  await page.goto('/comparador')
  await expect(page.getByText('No hay modelos nuevos cargados')).toHaveCount(0)
  await page.screenshot({ path: join(DIR, 'comparador-1280-light.png') })

  // Editar un precio desde el Centro de Control se refleja en la lista. La
  // navegación es interna: la demo descarta lo guardado al recargar la página.
  const nav = page.locator('aside')
  await openShellDestination(page, 'Centro de Control')
  const fila = page.getByTestId('fila-celular').filter({ hasText: 'iPhone 12' }).first()
  await expect(fila).toBeVisible()
  await fila.getByRole('textbox').fill('2999000')
  await page.getByTestId('guardar-precios').click()
  await expect(page.getByText(/1 precio\(s\) guardados/).last()).toBeVisible()
  await openShellDestination(page, 'Lista por modelo')
  await expect(page.frameLocator('iframe').getByText('Gs 2.999.000').first()).toBeVisible()

  // El lineup agrega los modelos que faltan (sin precio); al completarlo,
  // aparecen en la lista que ve el cliente.
  await openShellDestination(page, 'Centro de Control')
  await page.getByTestId('cargar-lineup').click()
  await expect(page.getByText(/modelo\(s\) iPhone agregados/)).toBeVisible()
  const filaLineup = page.getByTestId('fila-celular').filter({ hasText: 'iPhone 17 Pro Max' }).first()
  await expect(filaLineup).toBeVisible()
  await filaLineup.getByRole('textbox').fill('9999000')
  await page.getByTestId('guardar-precios').click()
  await expect(page.getByText(/1 precio\(s\) guardados/).last()).toBeVisible()
  await openShellDestination(page, 'Lista por modelo')
  await expect(page.frameLocator('iframe').getByText('iPhone 17 Pro Max', { exact: true }).first()).toBeVisible()
  await expect(page.frameLocator('iframe').getByText('Gs 9.999.000').first()).toBeVisible()
})

test('#303 · una foto subida reemplaza la maqueta en el Comparador', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await entrarDemo(page)
  const nav = page.locator('aside')

  await openShellDestination(page, 'Centro de Control')
  await page.getByRole('tab', { name: 'Imágenes', exact: true }).click()
  await expect(page.getByTestId('centro-imagenes')).toBeVisible()
  await page.getByTestId('input-fotos').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: FOTO_PNG })

  const pendientes = page.getByTestId('fotos-pendientes')
  await expect(pendientes).toBeVisible()
  await pendientes.getByLabel('Modelo').selectOption('iPhone 15 Pro Max')
  await pendientes.getByLabel('Color').fill('Titanio')
  await page.getByTestId('guardar-fotos').click()
  await expect(page.getByText(/1 foto\(s\) guardadas/)).toBeVisible()
  await expect(page.getByTestId('fotos-guardadas').getByText('iPhone 15 Pro Max')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'centro-fotos-1280-light.png') })

  // La primera columna es iPhone 15 Pro Max y toma el color de la foto subida.
  await openShellDestination(page, 'Comparador')
  await page.getByRole('button', { name: 'Color Titanio', exact: true }).first().click()
  await expect(page.locator('main img[alt="iPhone 15 Pro Max Titanio"]:visible')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'comparador-con-foto-1280-light.png') })
})
