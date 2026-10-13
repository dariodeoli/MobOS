import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination } from '../helpers/shell-navigation.js'
import { expectLayoutContract, measureLayout } from './helpers/layoutContract.js'

// Unit 2C (Ventas e Inicio): QA-A on Inicio, /ops, Pedidos, Cotizaciones,
// Clientes, Entregas and Taller at 375/768/1280/1440, light and dark. Demo
// frontend-only (no backend). Content findings are enforced (scope 'all').
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-ventas-layout-qa'
const REPORT = process.env.MOBOS_QA_REPORT === '1'

const WIDTHS = [
  [375, 812],
  [768, 1024],
  [1280, 900],
  [1440, 900],
]
const SCREENS = ['Inicio', 'Pedidos', 'Cotizaciones', 'Clientes', 'Delivery', 'Taller y garantías']

async function enterDemo(page, role = 'Dueño') {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: `Entrar como ${role}`, exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function setDark(page) {
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

async function check(page, label) {
  if (!REPORT) return expectLayoutContract(page, label, { scope: 'all' })
  const m = await measureLayout(page)
  const bits = []
  if (m.hscroll) bits.push('HSCROLL')
  if (m.firstContentTop > (m.mobile ? 168 : 132)) bits.push(`top=${m.firstContentTop}`)
  for (const k of ['small', 'overlaps', 'cutAmounts', 'lowContrast']) if (m[k].length) bits.push(`${k}:${JSON.stringify(m[k].slice(0, 6))}`)
  if (bits.length) console.log(`FIND ${label} ${bits.join(' ')}`)
  return m
}

for (const dark of [false, true]) {
  test(`QA-A ventas e inicio ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.setViewportSize({ width: 375, height: 812 })
    await enterDemo(page)
    if (dark) await setDark(page)
    for (const [width, height] of WIDTHS) {
      await page.setViewportSize({ width, height })
      for (const screen of SCREENS) {
        await openShellDestination(page, screen)
        await settle(page)
        await check(page, `${screen} · ${width}px · ${dark ? 'dark' : 'light'}`)
      }
      // /ops lives outside the panel shell: same contract, same session.
      await page.goto('/ops', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('ops-tablero')).toBeVisible()
      await expect(page.getByTestId('ops-actualizado')).toBeVisible()
      await check(page, `Operaciones · ${width}px · ${dark ? 'dark' : 'light'}`)
      await page.goBack({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('shell')).toBeVisible()
    }
  })
}

test('Inicio: Vendedor muestra el nombre completo a 1280, "Para resolver hoy" alineado y "Hoy" de 44px', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Inicio')
  await settle(page)
  const table = page.locator('table').first()
  const headers = await table.locator('thead th').allInnerTexts()
  const col = headers.findIndex(text => text.trim() === 'Vendedor')
  expect(col, 'columna Vendedor').toBeGreaterThan(-1)
  const cells = table.locator(`tbody tr td:nth-child(${col + 1}) span`)
  expect(await cells.count()).toBeGreaterThan(0)
  const nombres = await page.evaluate(async () => (await import('/src/lib/storage.js')).getVendedores().map(v => v.nombre))
  for (const cell of await cells.all()) {
    const text = (await cell.innerText()).trim()
    expect(nombres, `nombre completo «${text}»`).toContain(text)
    const cut = await cell.evaluate(el => ({ over: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis' }))
    expect(cut, `«${text}» cortado`).toEqual({ over: false, ellipsis: false })
  }
  // Rows of "Para resolver hoy" start where the card title starts (no indent).
  const card = page.getByRole('heading', { name: 'Para resolver hoy', exact: true })
  const left = (await card.boundingBox()).x
  for (const row of await card.locator('xpath=..').getByRole('button').all())
    expect(Math.abs((await row.boundingBox()).x - left), 'fila alineada con el título').toBeLessThanOrEqual(1)
  await page.screenshot({ path: `${out}/ventas-inicio-1440-pre.png` })
  await page.setViewportSize({ width: 375, height: 812 })
  await settle(page)
  const hoy = await page.getByRole('button', { name: /^Hoy$/ }).boundingBox()
  expect(hoy.height, '"Hoy" alto').toBeGreaterThanOrEqual(44)
  // The period/section switches are tabs and chips, never native selects.
  expect(await page.locator('main select:visible').count(), 'selects nativos en Inicio').toBe(0)
})

test('Operaciones: badge "Demo", KPIs de 2 columnas compactos y botones de 44px en celular', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  await page.goto('/ops', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('ops-tablero')).toBeVisible()
  const badge = page.getByTestId('ops-actualizado')
  await expect(badge).toContainText(/^Demo/)
  await expect(badge).not.toContainText('Datos reales')
  const a = await page.getByTestId('ops-kpi-cobrado').boundingBox()
  const b = await page.getByTestId('ops-kpi-pedidos').boundingBox()
  expect(Math.abs(a.y - b.y), 'dos KPIs por fila').toBeLessThanOrEqual(1)
  expect(a.height, 'KPI compacto').toBeLessThanOrEqual(96)
  for (const target of [page.getByTestId('ops-refrescar'), page.getByRole('link', { name: /Volver a la app/ })])
    expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44)
})

test('Cotizaciones: "Más" es un botón de 44px y "Más estados" despliega chips, sin selects', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  await openShellDestination(page, 'Cotizaciones')
  await settle(page)
  const quotes = page.getByTestId('ventas-cotizaciones-f3')
  expect(await quotes.locator('select').count(), 'selects nativos').toBe(0)
  const more = quotes.getByTestId('cotizacion-fila').first().getByRole('button', { name: 'Más', exact: true })
  const box = await more.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(await more.evaluate(el => parseFloat(getComputedStyle(el.firstElementChild).borderTopWidth)), 'botón con borde propio').toBeGreaterThan(0)
  await page.screenshot({ path: `${out}/ventas-cot-375.png` })
  const drafts = await page.evaluate(async () => (await import('/src/lib/demoCotizaciones.js')).listDemoCotizaciones().filter(row => row.status === 'DRAFT').length)
  const overflow = quotes.getByRole('button', { name: 'Más estados', exact: true })
  await expect(overflow).toHaveAttribute('aria-expanded', 'false')
  await overflow.click()
  await quotes.getByRole('button', { name: 'Borradores', exact: true }).click()
  await expect(quotes.getByRole('button', { name: 'Borradores', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('cotizacion-fila')).toHaveCount(drafts)
  // The row menu closes with Escape and returns the focus to its trigger.
  await more.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(more).toBeFocused()
})

test('Pedidos: un solo punto de entrada a los filtros y el orden, sin selects, en celular', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await enterDemo(page)
  await openShellDestination(page, 'Pedidos')
  await settle(page)
  const orders = page.getByTestId('ventas-pedidos-f3')
  expect(await page.locator('main select:visible').count(), 'selects nativos').toBe(0)
  expect(await orders.getByRole('button', { name: 'Más estados', exact: true }).count(), 'una sola entrada de filtros').toBe(1)
  await expect(orders.getByText('Más filtros y orden')).toHaveCount(0)
  await orders.getByRole('button', { name: 'Más estados', exact: true }).click()
  await orders.getByRole('button', { name: 'Parciales', exact: true }).click()
  const parciales = await page.evaluate(async () => {
    const { listVentas } = await import('/src/lib/storage.js')
    const { orderFields } = await import('/src/components/ventas/SellerOrders.jsx')
    return listVentas().map(orderFields).filter(row => row.paymentStatus === 'Parcial' && !(row.creditDays > 0 && row.pending > 0) && row.status !== 'CANCELLED').length
  })
  await expect(page.getByTestId('pedido-fila')).toHaveCount(parciales)
  await orders.getByRole('button', { name: 'Todos', exact: true }).click()
  const sort = orders.getByTestId('pedidos-orden')
  await sort.getByRole('button', { name: 'Ordenar', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Cantidad', exact: true }).click()
  await expect(sort).toHaveAttribute('data-orden', 'quantity')
  await sort.getByRole('button', { name: 'Ordenar', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Ordenar pedidos' })).toBeVisible()
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Ordenar pedidos' })).toBeHidden()
})
