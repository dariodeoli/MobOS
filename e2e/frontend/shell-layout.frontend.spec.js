import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { clickShellTab, openShellDestination } from '../helpers/shell-navigation.js'
import { expectLayoutContract, measureLayout } from './helpers/layoutContract.js'

// Shell redesign (unit 1A): QA-A measured on the demo (frontend-only, no
// backend) for owner, seller, technician and delivery in light and dark.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-shell-layout-qa'

const WIDTHS = [
  [375, 812],
  [768, 1024],
  [1280, 900],
  [1440, 900],
]
const ROLES = {
  Dueño: ['Inicio', 'Pedidos', 'Unidades', 'Finanzas', 'Análisis', 'Configuración'],
  Vendedor: ['Mis pedidos', 'Cotizaciones', 'Productos'],
  Técnico: ['Taller y garantías'],
  Delivery: ['Mis repartos'],
}

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
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
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
  await page.waitForTimeout(150)
}

for (const [role, screens] of Object.entries(ROLES)) {
  for (const dark of [false, true]) {
    test(`QA-A shell ${role} ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width: 375, height: 812 })
      await enterDemo(page, role)
      await setTheme(page, dark)
      const open = []
      for (const [width, height] of WIDTHS) {
        await page.setViewportSize({ width, height })
        for (const screen of screens) {
          await openShellDestination(page, screen)
          await settle(page)
          const label = `${role} · ${screen} · ${width}px · ${dark ? 'dark' : 'light'}`
          const m = await expectLayoutContract(page, label)
          for (const kind of ['small', 'overlaps', 'lowContrast'])
            for (const item of m[kind].filter(entry => !entry.shell))
              open.push(`${label} ${kind}: ${item.what} ${item.size || item.ratio || ''}`)
        }
      }
      // Findings inside page content belong to the unit that owns that screen.
      for (const description of open.slice(0, 60))
        testInfo.annotations.push({ type: 'content', description })
      testInfo.annotations.push({ type: 'content-total', description: String(open.length) })
      console.log(`${role} ${dark ? 'dark' : 'light'}: ${open.length} open content findings (owned by each screen's unit)`)
    })
  }
}

test('owner Stock: tabs end at y<=110 at 1440 and header chrome stays compact at 390', async ({
  page,
}) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Unidades')
  await settle(page)
  const tabs = page.getByTestId('shell-contexto')
  const box = await tabs.boundingBox()
  expect(box.y + box.height, 'tabs end').toBeLessThanOrEqual(110)
  await page.screenshot({ path: `${out}/1440-owner-stock.png` })
  for (const [name, screen] of [
    ['finanzas', 'Finanzas'],
    ['analisis', 'Análisis'],
    ['pedidos', 'Pedidos'],
    ['compras', 'Compras'],
  ]) {
    await openShellDestination(page, screen)
    await settle(page)
    const nav = page.getByTestId(name === 'finanzas' ? 'shell-pestanas' : 'shell-contexto')
    const b = await nav.boundingBox()
    expect(b.y + b.height, `${screen} tabs end`).toBeLessThanOrEqual(110)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await openShellDestination(page, 'Unidades')
  await settle(page)
  const header = await page.getByTestId('shell-mobile-header').boundingBox()
  expect(header.height).toBeLessThanOrEqual(64)
  await expect(page.getByTestId('shell-sucursal-mobile')).toContainText(/Casa Central/)
  await page.screenshot({ path: `${out}/390-owner-stock.png` })
})

test('aria-current marks the active tab on both levels and no select is used', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Lista por modelo')
  await settle(page)
  const level1 = page.getByTestId('shell-contexto')
  const level2 = page.getByTestId('shell-subcontexto')
  await expect(level1.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(level1.locator('[data-tab-id="precios"]')).toHaveAttribute('aria-current', 'page')
  await expect(level2.locator('[aria-current="page"]')).toHaveCount(1)
  await expect(level2.locator('[data-tab-id="celulares"]')).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/\/celulares$/)
  await clickShellTab(page, 'shell-subcontexto', 'comparador')
  await expect(page).toHaveURL(/\/comparador$/)
  await expect(page.locator('select[aria-label^="Secciones"], select[aria-label^="Destinos"], select[aria-label^="Áreas"]')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navegación principal' }).locator('[aria-current="page"]')).toHaveText('Stock')
})

test('desktop overflow moves tabs that do not fit to a measured Más popover and Esc closes it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 })
  await enterDemo(page)
  // Larger text makes the seven Stock tabs wider than the row.
  await page.addStyleTag({ content: 'html { font-size: 20px; }' })
  await openShellDestination(page, 'Unidades')
  await settle(page)
  const tabs = page.getByTestId('shell-contexto')
  const more = tabs.locator('[data-tab-more]')
  await expect(more).toBeVisible()
  // Nothing wraps: every visible tab sits on the same row.
  const ys = await tabs
    .locator('[data-tab-id]')
    .evaluateAll(nodes => nodes.map(n => Math.round(n.getBoundingClientRect().y)))
  expect(new Set(ys).size).toBe(1)
  await more.click()
  await expect(tabs.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tabs.getByRole('menu')).toBeHidden()
  // A hidden destination is reachable by clicking and then becomes the visible active tab.
  await openShellDestination(page, 'Métricas de abastecimiento')
  await expect(page).toHaveURL(/\/metricas$/)
  await expect(tabs.locator('[data-tab-id="abastecimiento"]')).toHaveAttribute('aria-current', 'page')
})

test('mobile owner bottom bar is Inicio, Vender, Pedidos, Stock and Más; the sheet reaches the rest and Esc closes it', async ({
  page,
}) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  const bar = page.getByTestId('shell-bottom-nav')
  await expect(bar.getByRole('button')).toHaveText(['Inicio', 'Vender', 'Pedidos', 'Stock', 'Más'])
  const barBox = await bar.boundingBox()
  expect(barBox.height).toBeLessThanOrEqual(64)
  await page.getByTestId('shell-mas').click()
  const sheet = page.getByTestId('shell-mas-hoja')
  await expect(
    sheet.getByRole('button'),
  ).toHaveText(['Clientes', 'Taller', 'Finanzas', 'Configuración', 'Ayuda'])
  await page.screenshot({ path: `${out}/390-owner-mas.png` })
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.getByTestId('shell-mas').click()
  await sheet.getByRole('button', { name: 'Clientes', exact: true }).click()
  await expect(page).toHaveURL(/\/clientes$/)
  await expect(page.getByTestId('shell-mas')).toHaveAttribute('aria-current', 'page')
  // The tab strip scrolls (no native select) and every tab is a 44px target.
  const strip = page.getByTestId('shell-contexto')
  await expect(strip.getByRole('combobox')).toHaveCount(0)
  const sizes = await strip
    .locator('[data-tab-id]')
    .evaluateAll(nodes => nodes.map(n => Math.round(n.getBoundingClientRect().height)))
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44)
})

test('Configuración: second column with the sections on desktop, icon list on mobile, same testid', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Configuración')
  await settle(page)
  const rail = page.getByTestId('config-grupos')
  await expect(rail.locator('[data-tab-id]')).toHaveCount(9)
  const xs = await rail
    .locator('[data-tab-id]')
    .evaluateAll(nodes => nodes.map(n => Math.round(n.getBoundingClientRect().x)))
  expect(new Set(xs).size, 'one column').toBe(1)
  await page.screenshot({ path: `${out}/1440-owner-config.png` })
  // Mobile: the sections are a list with icons (own screen), one per row.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configuracion')
  await settle(page)
  const lista = await rail.locator('[data-tab-id]').evaluateAll(nodes =>
    nodes.map(n => Math.round(n.getBoundingClientRect().y)),
  )
  expect(new Set(lista).size, 'one row each').toBe(9)
  await expect(rail.getByRole('combobox')).toHaveCount(0)
})

test('demo notice is a small chip in the title row (not its own row), dismissible per session and keeps Cómo funciona', async ({
  page,
}) => {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    const banner = page.getByTestId('demo-aviso')
    await expect(banner).toContainText('Demo')
    const box = await banner.boundingBox()
    // Chip: 44px target (+ border) below lg, ~28px on desktop: small, never a full row.
    expect(box.height).toBeLessThanOrEqual(width < 1024 ? 48 : 32)
    // Not its own row: it lives in the page header's title row, whose H1 is
    // still in the DOM (sr-only below lg when there are tabs).
    const titulo = page.locator('h1').first()
    const tituloBox = await titulo.boundingBox()
    if (width >= 1024) expect(Math.abs(box.y + box.height / 2 - (tituloBox.y + tituloBox.height / 2))).toBeLessThan(24)
    expect(await banner.evaluate(el => getComputedStyle(el).position)).toBe('static')
    await expect(page.getByTestId('demo-como-funciona')).toBeVisible()
    await page.getByTestId('demo-como-funciona').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('demo-aviso-ocultar').click()
    await expect(banner).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('shell')).toBeVisible()
    await expect(page.getByTestId('demo-aviso')).toHaveCount(0)
    await page.evaluate(() => sessionStorage.clear())
  }
  const m = await measureLayout(page)
  expect(m.hscroll).toBe(false)
})

for (const dark of [false, true]) {
  for (const [width, height] of [
    [1440, 900],
    [1280, 900],
    [390, 844],
    [375, 812],
  ]) {
    test(`bell, branch and theme toggle live in the header; online avatar lives at the sidebar bottom above Ayuda (${width} ${dark ? 'dark' : 'light'})`, async ({
      page,
    }, testInfo) => {
      await mkdir(out, { recursive: true })
      const mobile = width < 1024
      await page.setViewportSize({ width, height })
      await enterDemo(page)
      await setTheme(page, dark)
      const bell = page.getByTestId(mobile ? 'notificaciones-aviso-mobile' : 'notificaciones-aviso')
      const avatar = page.getByTestId(mobile ? 'shell-perfil-mobile' : 'shell-perfil')
      await expect(bell).toBeVisible()
      await expect(bell).toHaveAttribute('aria-expanded', 'false')
      await expect(avatar).toBeVisible()
      for (const el of [bell, avatar]) {
        const b = await el.boundingBox()
        expect(b.width, 'target w').toBeGreaterThanOrEqual(44)
        expect(b.height, 'target h').toBeGreaterThanOrEqual(44)
      }
      await expect(avatar).toHaveAttribute('aria-label', /en línea$/)
      await expect(avatar.getByTestId('persona-chip')).toHaveAttribute('title', /en línea$/)
      // Badge count equals the unread count announced by the label.
      const label = await bell.getAttribute('aria-label')
      const badge = bell.getByTestId('notificaciones-contador')
      if (await badge.count()) {
        const n = (await badge.textContent()).trim()
        expect(label).toBe(`Notificaciones, ${n} sin leer`)
      } else {
        expect(label).toBe('Notificaciones')
      }
      if (mobile) {
        const header = await page.getByTestId('shell-mobile-header').boundingBox()
        expect(header.height).toBeLessThanOrEqual(64)
        const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        expect(sw, 'no horizontal scroll').toBe(true)
        await page.getByTestId('shell-mas').click()
        await expect(page.getByTestId('shell-mas-hoja').getByText('Notificaciones')).toHaveCount(0)
        await page.keyboard.press('Escape')
      } else {
        const side = page.getByTestId('shell-lateral')
        await expect(side.getByText('Notificaciones')).toHaveCount(0)
        await expect(side.getByText(/en línea/i)).toHaveCount(0)
        // The user (photo + name + small role) sits at the sidebar bottom, above Ayuda.
        await expect(side.getByTestId('shell-perfil')).toBeVisible()
        await expect(side.getByTestId('shell-perfil')).toContainText(/Dueño|Vendedor|Administrador|\S/)
        const perfilBox = await avatar.boundingBox()
        const ayudaBox = await side.getByTestId('shell-pie-ayuda').boundingBox()
        expect(perfilBox.y + perfilBox.height, 'user above Ayuda').toBeLessThanOrEqual(ayudaBox.y + 1)
        // Header: branch + bell + theme toggle, 44px targets, in that order.
        const sucursal = page.getByTestId('shell-sucursal-desktop')
        const tema = page.getByTestId('shell-tema')
        await expect(page.getByTestId('shell-lateral').getByTestId('shell-sucursal-desktop')).toHaveCount(0)
        const [sb, bb2, tb] = await Promise.all([sucursal, bell, tema].map(el => el.boundingBox()))
        expect(sb.x + sb.width, 'branch before bell').toBeLessThanOrEqual(bb2.x + 1)
        expect(bb2.x + bb2.width, 'bell before theme').toBeLessThanOrEqual(tb.x + 1)
        for (const b of [bb2, tb]) {
          expect(b.width).toBeGreaterThanOrEqual(44)
          expect(b.height).toBeGreaterThanOrEqual(44)
        }
        await tema.click()
        await expect(page.locator('html')).toHaveClass(dark ? /^(?!.*dark)/ : /dark/)
        await tema.click()
        // Compact nav: every section row is 36px with no band taller than 24px, and no scrolling at 1440x900.
        const nav = side.getByRole('navigation', { name: 'Navegación principal' })
        // Configuración va abajo, separada con su divisor (#410): se mide aparte.
        const gaps = await nav.locator('button:not([data-testid="shell-config-pie"] button)').evaluateAll(nodes => {
          const rects = nodes.map(n => n.getBoundingClientRect())
          return rects.slice(1).map((r, i) => r.top - rects[i].bottom)
        })
        expect(Math.max(...gaps), 'banda vacía entre ítems').toBeLessThanOrEqual(24)
        expect(await nav.evaluate(el => el.scrollHeight <= el.clientHeight), 'nav sin scroll').toBe(true)
        // Same row as the H1.
        const h1 = await page.locator('h1').boundingBox()
        const bb = await bell.boundingBox()
        expect(Math.abs(h1.y + h1.height / 2 - (bb.y + bb.height / 2))).toBeLessThanOrEqual(12)
        await openShellDestination(page, 'Unidades')
        await settle(page)
        const tabs = await page.getByTestId('shell-contexto').boundingBox()
        expect(tabs.y + tabs.height, 'tabs end').toBeLessThanOrEqual(110)
        if (width === 1440 && !dark) await page.screenshot({ path: `${out}/header-1440.png`, clip: { x: 232, y: 0, width: 1208, height: 140 } })
      }
      // Esc closes both popovers and returns focus to the trigger.
      await avatar.click()
      await expect(page.getByRole('dialog', { name: 'Perfil y preferencias' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Perfil y preferencias' })).toBeHidden()
      await expect(avatar).toBeFocused()
      await bell.click()
      await expect(bell).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByTestId('notificaciones-panel')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(bell).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByTestId('notificaciones-panel')).toHaveCount(0)
      const m = await expectLayoutContract(page, `header ${width} ${dark ? 'dark' : 'light'}`)
      for (const kind of ['small', 'lowContrast'])
        for (const item of m[kind].filter(entry => entry.shell))
          testInfo.annotations.push({ type: kind, description: `${width} ${item.what}` })
    })
  }
}

// Menú plegado: columna de solo íconos. Secciones, pie, sucursal y píldora
// offline se pliegan juntos; las etiquetas pasan a tooltip y aria-label.
for (const dark of [false, true]) {
  for (const [width, height] of [
    [1280, 900],
    [1440, 900],
  ]) {
    test(`menú plegado ${width} ${dark ? 'dark' : 'light'}: todo en una columna de íconos con etiquetas accesibles`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await enterDemo(page, 'Dueño')
      await setTheme(page, dark)
      const side = page.getByTestId('shell-lateral')
      const expandido = (await side.boundingBox()).width
      await side.getByRole('button', { name: 'Colapsar menú' }).click()
      await expect(side.getByRole('button', { name: 'Expandir menú' })).toBeVisible()
      await page.waitForTimeout(150)
      const box = await side.boundingBox()
      expect(box.width, 'columna plegada más angosta').toBeLessThan(expandido / 2)
      expect(box.width, 'columna de íconos').toBeLessThanOrEqual(72)
      // Sin textos visibles: ni secciones, ni pie, ni sucursal, ni tienda.
      await expect(side.getByTestId('shell-tienda')).toHaveCount(0)
      await expect(side.getByText('Buscar…')).toHaveCount(0)
      // La sucursal vive en el encabezado, no en la columna plegada.
      await expect(side.getByTestId('sucursal-info').or(side.getByTestId('sucursal-selector'))).toHaveCount(0)
      await expect(page.getByTestId('shell-sucursal-desktop')).toBeVisible()
      const botones = side.getByRole('button')
      const total = await botones.count()
      expect(total).toBeGreaterThan(4)
      for (let i = 0; i < total; i += 1) {
        const boton = botones.nth(i)
        const b = await boton.boundingBox()
        const nombre = await boton.getAttribute('aria-label')
        expect(nombre, `botón ${i} con aria-label`).toBeTruthy()
        expect(b.width, `${nombre} ancho`).toBeGreaterThanOrEqual(44)
        expect(b.height, `${nombre} alto`).toBeGreaterThanOrEqual(44)
        expect(b.x + b.width, `${nombre} dentro de la columna`).toBeLessThanOrEqual(box.x + box.width + 0.5)
        expect(await boton.innerText(), `${nombre} sin texto visible`).toBe('')
      }
      const sinTitle = await side.locator('[data-testid^="shell-pie-"], nav button').evaluateAll(els => els.filter(el => !el.getAttribute('title')).length)
      expect(sinTitle, 'tooltips en secciones y pie').toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'sin scroll horizontal').toBe(true)
      await side.getByRole('button', { name: 'Expandir menú' }).click()
      await expect(side.getByTestId('shell-tienda')).toBeVisible()
      expect((await side.boundingBox()).width).toBeCloseTo(expandido, 0)
    })
  }
}
