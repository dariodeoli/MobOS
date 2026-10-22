import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination, selectInventorySection } from '../helpers/shell-navigation.js'
import { esperarAnimaciones } from '../helpers/animaciones.js'

// Una sola fila de pestañas con íconos (PR «una sola fila de pestañas con íconos»):
//  - Clientes: ni «Clientes» repetido ni una segunda fila (Clientes · Campañas).
//  - Todas las pestañas del shell llevan ícono decorativo (aria-hidden) y etiqueta.
//  - El segundo nivel de Precios y Traslados no se mueve entre vistas.
// Demo frontend-only, sin backend.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pestanas-iconos'
const VIEWPORTS = [
  [390, 844],
  [1440, 900],
]

async function enterDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

const sinDesborde = page =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

for (const [width, height] of VIEWPORTS) {
  test(`Clientes tiene una sola fila de pestañas con íconos · ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await openShellDestination(page, 'Clientes')
    await expect(page).toHaveURL(/\/clientes$/)

    // Una sola barra de pestañas; ningún «Clientes · Campañas» debajo.
    await expect(page.getByTestId('shell-contexto')).toHaveCount(1)
    await expect(page.locator('.clientes-f3-secciones')).toHaveCount(0)
    await expect(page.getByTestId('shell-subcontexto')).toHaveCount(0)
    const fila = page.getByTestId('shell-contexto')
    await expect(fila.locator('[data-tab-id="clientes"]')).toHaveCount(1)

    const tabs = fila.locator('[data-tab-id]')
    const total = await tabs.count()
    expect(total).toBeGreaterThanOrEqual(3)
    for (let i = 0; i < total; i++) {
      const tab = tabs.nth(i)
      // Ícono decorativo + etiqueta visible; objetivo táctil de 44 px en móvil.
      const icono = tab.locator('svg[data-tab-icon]')
      await expect(icono).toHaveCount(1)
      await expect(icono).toHaveAttribute('aria-hidden', 'true')
      expect(((await tab.innerText()) || '').trim().length).toBeGreaterThan(0)
      if (width < 768) expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(44)
    }
    expect(await sinDesborde(page)).toBe(true)
    await page.screenshot({ path: `${out}/clientes-${width}.png` })
  })
}

test('las pestañas de Finanzas y Análisis también llevan ícono', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await page.goto('/finanzas/caja')
  const fila = page.locator('[data-testid="shell-pestanas"]')
  await expect(fila).toHaveCount(1)
  const tabs = fila.locator('[data-tab-id]')
  const total = await tabs.count()
  for (let i = 0; i < total; i++) await expect(tabs.nth(i).locator('svg[data-tab-icon]')).toHaveCount(1)
})

async function caja(locator) {
  const box = await locator.boundingBox()
  // El ancho varía unos px porque la pestaña activa va en negrita: lo que no puede
  // moverse es el origen ni la altura.
  return { x: Math.round(box.x), y: Math.round(box.y), h: Math.round(box.height) }
}

for (const [width, height] of VIEWPORTS) {
  test(`Precios: el segundo nivel no se mueve entre vistas · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await openShellDestination(page, 'Precios')
    const nav = page.getByTestId('shell-subcontexto')
    await expect(nav).toBeVisible()
    const base = await caja(nav)
    for (const id of ['celulares', 'comparador', 'centro-control', 'precios']) {
      await nav.locator(`[data-tab-id="${id}"]`).click()
      await expect(nav.locator(`[data-tab-id="${id}"]`)).toHaveAttribute('aria-current', 'page')
      await expect(page.getByTestId('shell-subcontexto')).toBeVisible()
      // La entrada de la vista (translateY de 8 px) mueve la fila unos ms: medir al terminar.
      await esperarAnimaciones(page)
      const ahora = await caja(page.getByTestId('shell-subcontexto'))
      expect(Math.abs(ahora.y - base.y), `origen en ${id}`).toBeLessThanOrEqual(1)
      expect({ ...ahora, y: base.y }).toEqual(base)
      // Sin botones duplicados de los segmentos.
      await expect(page.getByTestId('ir-centro-control')).toHaveCount(0)
      expect(await sinDesborde(page)).toBe(true)
    }
  })

  test(`Traslados: el segundo nivel no se mueve entre vistas · ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await openShellDestination(page, 'Traslados')
    const vistas = page.getByTestId('subtabs-inventario')
    await expect(vistas).toBeVisible()
    const base = await caja(vistas)
    for (const vista of ['transito', 'traslados']) {
      await selectInventorySection(page, vista)
      expect(await caja(page.getByTestId('subtabs-inventario'))).toEqual(base)
      expect(await sinDesborde(page)).toBe(true)
    }
  })
}

for (const [width, height] of [[390, 844], [1440, 900]]) {
  for (const dark of [false, true]) {
    test(`Productos: íconos y acciones visibles ${width}px ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.addInitScript(value => localStorage.setItem('mobos:theme', value), dark ? 'dark' : 'light')
      await enterDemo(page)
      await openShellDestination(page, 'Productos')
      const catalog = page.getByTestId('catalogo-productos')
      await expect(catalog).toBeVisible()
      await expect(catalog.getByRole('button', { name: 'Actualizar', exact: true }).locator('svg')).toBeVisible()
      const chips = catalog.getByTestId('chips-accesorio').getByRole('button')
      expect(await chips.count()).toBeGreaterThan(1)
      for (let i = 0; i < await chips.count(); i++) await expect(chips.nth(i).locator('svg')).toBeVisible()
      // Cada producto conserva una foto o fallback, no solo los chips.
      const photos = catalog.getByTestId('foto-producto')
      expect(await photos.count()).toBeGreaterThan(0)
      for (let i = 0; i < await photos.count(); i++) await expect(photos.nth(i).locator('svg, img')).toBeVisible()
      if (width < 1024) {
        const nav = page.getByTestId('shell-bottom-nav').getByRole('button')
        for (let i = 0; i < await nav.count(); i++) await expect(nav.nth(i).locator('svg')).toBeVisible()
      }
      const icons = await catalog.locator('svg').evaluateAll(elements => elements.map(el => {
        const box = el.getBoundingClientRect(), style = getComputedStyle(el)
        return { width: box.width, height: box.height, display: style.display, visibility: style.visibility, strokes: el.querySelectorAll('path,rect,circle,line,polyline,polygon,ellipse').length }
      }).filter(item => item.display !== 'none' && item.visibility !== 'hidden' && item.width > 0))
      expect(icons.length).toBeGreaterThan(5)
      for (const icon of icons) {
        expect(icon.height).toBeGreaterThan(0)
        expect(icon.strokes).toBeGreaterThan(0)
      }
      expect(await sinDesborde(page)).toBe(true)
      await mkdir(out, { recursive: true })
      await page.screenshot({ path: `${out}/productos-iconos-${width}-${dark ? 'oscuro' : 'claro'}.png` })
    })
  }
}
