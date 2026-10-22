import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { entrarDemoComo } from '../helpers/demo.js'

// #410 · Navegación de Configuración: menú angosto con íconos como segunda
// columna, menú principal plegado dentro y restaurado al salir, búsqueda global
// (⌘K) que también encuentra ajustes según el rol y lista móvil. Frontend solo
// (demo), sin backend.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-config'

async function enterDemo(page, role = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Frontend-only harness"}',
        }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await entrarDemoComo(page, role)
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function abrirBusqueda(page, consulta) {
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Control+k')
  const dialogo = page.getByRole('dialog', { name: 'Búsqueda global' })
  await expect(dialogo).toBeVisible()
  await escribirBusqueda(page, consulta)
  return dialogo
}

async function escribirBusqueda(page, consulta) {
  await page.getByRole('combobox', { name: 'Buscar en toda la tienda', exact: true }).fill(consulta)
}

test('menú de Configuración: ≤220px a 1440, con íconos, buscador, empresa y «‹ Configuración»', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  const menu = page.getByTestId('shell-config-menu')
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box.width, 'ancho del menú de Configuración').toBeLessThanOrEqual(220)
  const items = page.getByTestId('config-grupos').locator('[data-tab-id]')
  await expect(items).toHaveCount(9)
  for (const item of await items.all()) await expect(item.locator('svg')).toHaveCount(1)
  await expect(page.getByTestId('config-buscar')).toBeVisible()
  await expect(page.getByTestId('config-empresa')).toBeVisible()
  await expect(page.getByTestId('config-volver')).toContainText('Configuración')
  // Configuración vive abajo del menú principal, separada, y el menú ya no la repite.
  const pie = page.getByTestId('shell-config-pie')
  await expect(pie.getByRole('button', { name: 'Configuración', exact: true })).toHaveAttribute('aria-current', 'page')
  const perfil = await page.getByTestId('shell-perfil').boundingBox()
  const config = await pie.boundingBox()
  expect(config.y + config.height, 'Configuración arriba del usuario').toBeLessThanOrEqual(perfil.y + 1)
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.getByRole('tablist', { name: 'Secciones de Negocio' })).toBeVisible()
  await page.screenshot({ path: `${out}/config-menu-1440.png` })
})

test('el buscador del menú usa el índice y lleva a la sección', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  await page.getByTestId('config-buscar').fill('dólar')
  const resultado = page.getByTestId('config-buscar-resultados').getByRole('button', { name: /Cotización del dólar/ })
  await expect(resultado).toBeVisible()
  await resultado.click()
  await expect(page).toHaveURL(/\/configuracion\/ventas-cobros/)
})

test('el menú principal se pliega dentro de Configuración y vuelve como estaba al salir', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const lateral = page.getByTestId('shell-lateral')
  expect((await lateral.boundingBox()).width, 'expandido antes de entrar').toBeGreaterThanOrEqual(200)
  await openShellDestination(page, 'Configuración')
  await expect.poll(async () => (await lateral.boundingBox()).width, 'plegado dentro de Configuración').toBeLessThanOrEqual(72)
  await expect(page.getByRole('button', { name: 'Expandir menú' })).toHaveCount(0)
  await page.getByTestId('config-volver').click()
  await expect(page.getByTestId('shell-config-menu')).toHaveCount(0)
  await expect.poll(async () => (await lateral.boundingBox()).width, 'restaurado al salir').toBeGreaterThanOrEqual(200)
  // Con el menú plegado por preferencia, sigue plegado al salir.
  await page.getByRole('button', { name: 'Colapsar menú' }).click()
  await expect.poll(async () => (await lateral.boundingBox()).width).toBeLessThanOrEqual(72)
  await page.getByTestId('shell-config-pie').getByRole('button', { name: 'Configuración', exact: true }).click()
  await expect(page.getByTestId('shell-config-menu')).toBeVisible()
  await page.getByTestId('config-volver').click()
  await expect(page.getByTestId('shell-config-menu')).toHaveCount(0)
  expect((await lateral.boundingBox()).width, 'sigue plegado por preferencia').toBeLessThanOrEqual(72)
})

test('⌘K «impresora» muestra el grupo Configuración y abre Impresoras', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const dialogo = await abrirBusqueda(page, 'impresora')
  await expect(dialogo.getByText('Configuración', { exact: true }).first()).toBeVisible()
  const resultado = dialogo.getByRole('option', { name: /Impresoras/ }).first()
  await expect(resultado).toContainText('Configuración › Impresión y documentos')
  await page.screenshot({ path: `${out}/busqueda-impresora-1440.png` })
  await resultado.click()
  await expect(page).toHaveURL(/\/configuracion\/impresion/)
  await expect(page.getByRole('heading', { level: 1, name: 'Impresión y documentos' })).toBeVisible()
})

test('⌘K «numeración» abre la pestaña interna y resalta el ajuste sin acentos ni mayúsculas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const dialogo = await abrirBusqueda(page, 'NUMERACION')
  await dialogo.getByRole('option', { name: /Numeración de pedidos/ }).first().click()
  await expect(page).toHaveURL(/\/configuracion\/negocio/)
  await expect(page.getByRole('tab', { name: 'Numeración', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-config-anchor="numeracion"][data-config-resaltado]')).toHaveCount(1)
  await expect(page).not.toHaveURL(/ajuste=/)
})

test('un vendedor no ve ajustes de administración en ⌘K, solo lo personal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page, 'Vendedor')
  const dialogo = await abrirBusqueda(page, 'impresora')
  await expect(dialogo.getByText('Sin resultados').or(dialogo.getByText(/No encontramos/))).toBeVisible()
  await expect(dialogo.getByText('Configuración › Impresión y documentos')).toHaveCount(0)
  await escribirBusqueda(page, 'costos vendedor')
  await expect(dialogo.getByText('Costos visibles para vendedores')).toHaveCount(0)
  await escribirBusqueda(page, 'sesiones')
  const propio = dialogo.getByRole('option', { name: /Sesiones y dispositivos/ }).first()
  await expect(propio).toBeVisible()
  await propio.click()
  await expect(page).toHaveURL(/\/mi-cuenta/)
})

test('pestaña «Zona de peligro» en rojo y con íconos en las pestañas internas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await page.goto('/configuracion/negocio')
  const tabs = page.getByRole('tablist', { name: 'Secciones de Negocio' })
  for (const tab of await tabs.getByRole('tab').all()) await expect(tab.locator('svg')).toHaveCount(1)
  const peligro = tabs.getByRole('tab', { name: 'Zona de peligro' })
  const rojo = await peligro.evaluate(el => getComputedStyle(el).color)
  const neutro = await tabs.getByRole('tab', { name: 'Numeración' }).evaluate(el => getComputedStyle(el).color)
  expect(rojo).not.toBe(neutro)
  const [r, g, b] = rojo.match(/\d+/g).map(Number)
  expect(r, 'rojo domina').toBeGreaterThan(g + 40)
  expect(r).toBeGreaterThan(b + 40)
})

test('celular 390: lista de secciones con íconos, sin scroll horizontal y con 44px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  await expect(page).toHaveURL(/\/configuracion$/)
  const lista = page.getByTestId('config-grupos')
  const items = lista.locator('[data-tab-id]')
  await expect(items).toHaveCount(9)
  for (const item of await items.all()) {
    await expect(item.locator('svg').first()).toBeVisible()
    expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal').toBe(true)
  await page.screenshot({ path: `${out}/config-lista-390.png` })
  // Entrar abre su pantalla con «‹» para volver a la lista.
  await lista.locator('[data-tab-id="impresion"]').click()
  await expect(page).toHaveURL(/\/configuracion\/impresion$/)
  await expect(page.getByTestId('config-grupos')).toHaveCount(0)
  const volver = page.getByRole('button', { name: 'Volver', exact: true })
  expect((await volver.boundingBox()).height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal en la sección').toBe(true)
  await volver.click()
  await expect(page).toHaveURL(/\/configuracion$/)
  await expect(page.getByTestId('config-grupos')).toBeVisible()
})
