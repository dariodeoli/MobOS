import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination, selectConfigSection } from '../helpers/shell-navigation.js'
import { expectLayoutContract } from './helpers/layoutContract.js'
import { entrarDemoComo } from '../helpers/demo.js'

// Configuración (unit 3A): QA-A on every section, the navigation contract
// (visible owner destination, every section reachable by click, old slugs
// redirect, nothing widened) and the screen-specific acceptance of audit
// #30-#34. Measured on the demo (frontend-only, no backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-config-qa'

const WIDTHS = [
  [375, 812],
  [430, 900],
  [768, 1024],
  [1280, 900],
  [1440, 900],
]

// New order (by frequency of use) -> [label, slug].
const SECCIONES = [
  ['Negocio', 'negocio'],
  ['Módulos', 'modulos'],
  ['Equipo y acceso', 'equipo'],
  ['Ventas y cobros', 'ventas-cobros'],
  ['Impresión y documentos', 'impresion'],
  ['Mensajes y avisos', 'mensajes'],
  ['Seguridad', 'seguridad'],
  ['Integraciones y sistema', 'sistema'],
  ['Mi cuenta', 'mi-cuenta'],
]

// Every section the old Configuración had -> where it lives now. The first
// value is a landmark that proves the content is reachable in the demo.
const DONDE_VIVE = [
  ['Mi cuenta (perfil, preferencias, sesiones)', 'mi-cuenta', /Tu perfil|Mi cuenta/],
  ['Datos de la tienda, sucursales, logo, numeración', 'negocio', /Datos de la tienda/],
  ['Módulos activos y desactivados', 'modulos', /módulos activos/],
  ['Equipo, invitaciones, roles, horarios', 'equipo', /Integrantes|Equipo/],
  ['Ventas y cobros (seguro de ventas, límites)', 'ventas-cobros', /Seguro de ventas/],
  ['Seguridad, sesiones y auditoría', 'seguridad', /Auditor|Historial|Seguridad/],
  ['Impresoras, puentes, etiquetas, tickets', 'impresion', /impresoras/i],
  ['Notificaciones, remitente y plantillas', 'mensajes', /Notificaciones/],
  ['Estado del sistema, correo, AEX, webhooks', 'sistema', /Sincronización/],
]

// Old slugs keep working (marcadores y enlaces enviados).
const REDIRECCIONES = [
  ['/configuracion', /\/configuracion\/negocio$/],
  ['/configuracion/identidad', /\/configuracion\/mi-cuenta$/],
  ['/configuracion/preferencias', /\/configuracion\/mi-cuenta$/],
  ['/configuracion/organizacion', /\/configuracion\/negocio$/],
  ['/configuracion/sucursales', /\/configuracion\/negocio$/],
  ['/configuracion/roles', /\/configuracion\/equipo$/],
  ['/configuracion/precios', /\/configuracion\/ventas-cobros$/],
  ['/configuracion/comercial', /\/configuracion\/ventas-cobros$/],
  ['/configuracion/historial', /\/configuracion\/seguridad$/],
  ['/configuracion/impresoras', /\/configuracion\/impresion$/],
  ['/configuracion/dispositivos', /\/configuracion\/impresion$/],
]

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

async function setTheme(page, dark) {
  if (!dark) return
  const mobile = page.viewportSize().width < 1024
  await page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil').click()
  await page
    .getByRole('dialog', { name: 'Perfil y preferencias' })
    .getByRole('button', { name: 'Cambiar a tema oscuro', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('html')).toHaveClass(/dark/)
}

async function settle(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  await page.waitForTimeout(300)
}

async function openConfig(page, label) {
  await openShellDestination(page, 'Configuración')
  await selectConfigSection(page, label)
  await settle(page)
}

async function expectInlineLinksUsable(page, label) {
  // #32: links that stand alone (not inside running text) are >= 44px tall.
  const short = await page.locator('main a[href], main [role="link"]').evaluateAll(nodes =>
    nodes
      .filter(n => {
        const r = n.getBoundingClientRect()
        if (r.width < 1 || r.height < 1) return false
        const parent = n.parentElement
        const inText = getComputedStyle(n).display === 'inline' && parent && parent.childNodes.length > 1
        return !inText && r.height < 43.5
      })
      .map(n => `${(n.textContent || '').trim().slice(0, 40)} ${Math.round(n.getBoundingClientRect().height)}px`),
  )
  expect(short, `${label}: stand-alone links under 44px`).toEqual([])
}

// #34: the largest vertical gap between consecutive blocks of the section's
// column, as a share of the viewport height (a short page ending early is not
// an empty band; a hole in the middle of the content is).
async function emptyBand(page) {
  return page.evaluate(() => {
    const column = document.querySelector('[data-testid="config-pagina"] > div:last-child')
    if (!column) return 0
    const blocks = [...column.children]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0)
      .sort((x, y) => x.top - y.top)
    let gap = 0
    for (let i = 1; i < blocks.length; i += 1) gap = Math.max(gap, blocks[i].top - blocks[i - 1].bottom)
    return gap / window.innerHeight
  })
}

test('Configuración is the last owner destination: visible, reachable by click, sections in frequency order', async ({
  page,
}) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const primary = page
    .getByTestId('shell-lateral')
    .getByRole('navigation', { name: 'Navegación principal', exact: true })
  // Solo las secciones: el chevrón del submenú (Finanzas despliega sus páginas) no es una sección.
  const labels = await primary.locator('button:not([data-testid^="shell-desplegar-"])').allTextContents()
  expect(labels.at(-1)?.trim()).toBe('Configuración')
  expect(labels.at(-2)?.trim()).toBe('Finanzas')
  await primary.getByRole('button', { name: 'Configuración', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion\/negocio$/)
  await expect(
    primary.getByRole('button', { name: 'Configuración', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  // The gear is the section icon (an svg), not a bare label.
  await expect(primary.getByRole('button', { name: 'Configuración', exact: true }).locator('svg')).toHaveCount(1)
  const rail = page.getByTestId('config-grupos')
  await expect(rail).toBeVisible()
  expect(await rail.locator('[data-tab-id]').evaluateAll(ns => ns.map(n => n.dataset.tabId))).toEqual(
    SECCIONES.map(([, slug]) => slug),
  )
  // The footer no longer repeats it.
  await expect(page.getByTestId('shell-pie-equipo')).toHaveCount(0)
  // Mobile: it lives in the Más sheet.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('shell-mas').click()
  const sheet = page.getByTestId('shell-mas-hoja')
  await expect(sheet.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(1)
  await sheet.getByRole('button', { name: 'Configuración', exact: true }).click()
  await expect(page).toHaveURL(/\/configuracion(\/|$)/)
  await expect(page.getByTestId('shell-mas')).toHaveAttribute('aria-current', 'page')
})

test('every pre-existing section is reachable by click and old slugs redirect', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  for (const [, slug, landmark] of DONDE_VIVE) {
    const label = SECCIONES.find(([, s]) => s === slug)[0]
    await openConfig(page, label)
    await expect(page).toHaveURL(new RegExp(`/configuracion/${slug}$`))
    await expect(page.locator('main')).toContainText(landmark)
  }
  for (const [vieja, nueva] of REDIRECCIONES) {
    await page.goto(vieja)
    await expect(page).toHaveURL(nueva)
  }
})

test('seller roles never get Configuración (no permission widened)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page, 'Vendedor')
  const primary = page
    .getByTestId('shell-lateral')
    .getByRole('navigation', { name: 'Navegación principal', exact: true })
  await expect(primary.getByRole('button', { name: 'Configuración', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('shell-pie-equipo')).toHaveCount(0)
  await page.goto('/configuracion/negocio')
  await expect(page).not.toHaveURL(/\/configuracion\//)
})

test('#542: dominios con cabecera común y sincronización de impresión dentro de Impresoras', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/configuracion/impresion')
    await expect(page.locator('h1')).toHaveText('Impresión y documentos')
    await expect(page.getByTestId('config-grupo-cabecera')).toContainText('Impresión y documentos')
    await page.getByTestId('panel-sincronizacion').click()
    await expect(page).toHaveURL(/\/configuracion\/impresion\?panel=sincronizacion/)
    await expect(page.getByTestId('impresoras-sincronizacion')).toBeVisible()
    for (const id of ['puentes', 'impresoras', 'trabajos']) {
      await expect(page.getByTestId(`impresoras-sync-${id}`)).toBeVisible()
    }
    const noDesborda = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
    expect(noDesborda, `Impresoras desborda a ${width}px`).toBe(true)
  }

  await page.goto('/configuracion/sistema')
  await expect(page.getByTestId('config-grupo-cabecera')).toContainText('Integraciones y sistema')
  await expect(page.getByTestId('monitoreo-vs-impresoras')).toContainText('Impresoras')
  await expect(page.getByTestId('impresoras-sincronizacion')).toHaveCount(0)
})

for (const [width, height] of WIDTHS) {
  for (const dark of [false, true]) {
    test(`QA-A Configuración ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(180_000)
      await mkdir(out, { recursive: true })
      await page.setViewportSize({ width: 375, height: 812 })
      await enterDemo(page)
      await setTheme(page, dark)
      await page.setViewportSize({ width, height })
      for (const [label, slug] of SECCIONES) {
        await openConfig(page, label)
        const name = `${label} · ${width}px · ${dark ? 'dark' : 'light'}`
        await expectLayoutContract(page, name, { scope: 'all' })
        // No stand-alone link or cut label inside the section.
        if (width < 1024) await expectInlineLinksUsable(page, name)
        // #34: no empty band larger than 15% of the visible column (desktop).
        if (width >= 1280) {
          const band = await emptyBand(page)
          expect.soft(band, `${name}: empty band ${(band * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.15)
        }
        if (!dark && ((width === 1440 && slug === 'impresion') || (width === 375 && slug === 'seguridad')))
          await page.screenshot({ path: `${out}/config-${slug}-${width}.png` })
      }
    })
  }
}

test('#30 Seguridad: activity feed shows the whole amount on its own line at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  await openConfig(page, 'Seguridad')
  const rows = page.getByTestId('historial-actividad').locator('li')
  expect(await rows.count()).toBeGreaterThan(0)
  const cut = await page
    .getByTestId('historial-actividad')
    .evaluate(root =>
      [...root.querySelectorAll('.tabular-nums, [data-monto]')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.textContent),
    )
  expect(cut, 'amounts in the activity feed are complete').toEqual([])
  const montos = page.getByTestId('historial-actividad').locator('[data-monto]')
  expect(await montos.count()).toBeGreaterThan(0)
  for (const monto of await montos.all()) {
    const box = await monto.boundingBox()
    const parent = await monto.evaluate(el => el.parentElement.getBoundingClientRect().width)
    expect(box.width).toBeLessThanOrEqual(parent + 1)
    expect(await monto.evaluate(el => /Gs\.?\s?[\d.]+/.test(el.textContent))).toBe(true)
  }
})

test('#31 Sistema: alert and device names are not truncated at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  await openConfig(page, 'Integraciones y sistema')
  const cut = await page.locator('main').evaluate(root =>
    [...root.querySelectorAll('*')]
      .filter(el => el.children.length === 0 && (el.textContent || '').trim())
      .filter(el => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
      .map(el => el.textContent.trim().slice(0, 50)),
  )
  expect(cut, 'texts cut with an ellipsis').toEqual([])
})

test('#608 Sistema: MCP queda pendiente hasta registrar OAuth', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await openConfig(page, 'Integraciones y sistema')
  const conexiones = page.getByTestId('mcp-conexiones')
  await expect(conexiones).toBeVisible()
  await expect(conexiones.getByTestId('mcp-oauth-pendiente')).toHaveCount(0)
  await expect(conexiones).toContainText('OAuth')
  await expect(conexiones.getByTestId('mcp-proveedor-chatgpt')).toContainText('Pendiente')
  await expect(conexiones.getByTestId('mcp-proveedor-claude')).toContainText('Pendiente')
})

test('#32 Impresión y Ventas y cobros: 44px targets at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  for (const label of ['Impresión y documentos', 'Ventas y cobros']) {
    await openConfig(page, label)
    await expectLayoutContract(page, label, { scope: 'all' })
    await expectInlineLinksUsable(page, label)
  }
})

test('#33 Mi cuenta: photo block has room and the columns line up at 375 and 1440', async ({ page }) => {
  for (const [width, height] of [
    [375, 812],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    if (width === 375) await enterDemo(page)
    await openConfig(page, 'Mi cuenta')
    const foto = page.getByTestId('mi-cuenta-foto')
    await expect(foto).toBeVisible()
    const box = await foto.boundingBox()
    expect(box.width, `${width}px: photo block fits`).toBeLessThanOrEqual(width)
    // Form columns share a left edge (even columns).
    const lefts = await page
      .getByTestId('mi-cuenta-form')
      .locator('label, [data-field]')
      .evaluateAll(ns => [...new Set(ns.map(n => Math.round(n.getBoundingClientRect().left)))])
    expect(lefts.length, `${width}px: field columns ${lefts}`).toBeLessThanOrEqual(2)
  }
})
