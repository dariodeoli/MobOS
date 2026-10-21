import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { esperarAnimaciones } from '../helpers/animaciones.js'
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
  await esperarAnimaciones(page)
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
      // /ops se muestra dentro del shell del panel: mismo contrato, misma sesión.
      await openShellDestination(page, 'Tablero de operaciones')
      await expect(page.getByTestId('shell')).toBeVisible()
      await expect(page.getByTestId('ops-tablero')).toBeVisible()
      await expect(page.getByTestId('ops-actualizado')).toBeVisible()
      await check(page, `Operaciones · ${width}px · ${dark ? 'dark' : 'light'}`)
    }
  })
}

test('Inicio: Vendedor muestra el nombre completo a 1280, "Para resolver hoy" alineado y "Hoy" de 44px', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Inicio')
  await settle(page)
  const table = page.locator('table').filter({ hasText: 'Vendedor' }).first()
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
  await openShellDestination(page, 'Tablero de operaciones')
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('ops-tablero')).toBeVisible()
  const badge = page.getByTestId('ops-actualizado')
  await expect(badge).toContainText(/^Demo/)
  await expect(badge).not.toContainText('Datos reales')
  const a = await page.getByTestId('ops-kpi-cobrado').boundingBox()
  const b = await page.getByTestId('ops-kpi-pedidos').boundingBox()
  expect(Math.abs(a.y - b.y), 'dos KPIs por fila').toBeLessThanOrEqual(1)
  expect(a.height, 'KPI compacto').toBeLessThanOrEqual(96)
  expect((await page.getByTestId('ops-refrescar').boundingBox()).height).toBeGreaterThanOrEqual(44)
  // Embebido: sin enlace «Volver a la app» (el shell ya es la navegación).
  await expect(page.getByRole('link', { name: /Volver a la app/ })).toHaveCount(0)
})

test('Inicio → Operaciones mantiene el shell (header y navegación) sin recarga completa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Inicio')
  await page.evaluate(() => { window.__sinRecarga = true })
  await openShellDestination(page, 'Tablero de operaciones')
  await expect(page).toHaveURL(/\/ops$/)
  await expect(page.getByTestId('ops-tablero')).toBeVisible()
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="resumen"]')).toBeVisible()
  await expect(page.getByTestId('shell-contexto').locator('[data-tab-id="ops"]')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('shell-lateral')).toBeVisible()
  expect(await page.evaluate(() => window.__sinRecarga), 'no hubo recarga completa').toBe(true)
  // Abrir /ops directo muestra lo mismo dentro del shell.
  await page.goto('/ops', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('shell')).toBeVisible()
  await expect(page.getByTestId('ops-tablero')).toBeVisible()
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

test('Pedidos: barra de UNA fila en escritorio, totales en una tira de una línea con el alcance una sola vez y lista arriba', async ({ page }) => {
  await enterDemo(page)
  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ]) {
    await page.setViewportSize({ width, height })
    await openShellDestination(page, 'Pedidos')
    await settle(page)
    const strip = page.getByTestId('resumen-pedidos')
    await expect(strip).toBeVisible()
    const m = await strip.evaluate(node => {
      const tiles = [...node.querySelectorAll(':scope > div')].map(el => el.getBoundingClientRect())
      const lista = document.querySelector('[data-testid="pedidos-tabla"]')?.getBoundingClientRect()
      return {
        tiles: tiles.map(r => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) })),
        stripH: Math.round(node.getBoundingClientRect().height),
        listaTop: lista ? Math.round(lista.top) : null,
        hscroll: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    console.log(`MEDIDA Pedidos @${width}`, JSON.stringify(m))
    if (width >= 1280) {
      // #388: buscador · chips · orden · acción principal en UNA sola fila.
      const filas = await page.getByTestId('barra-pedidos').evaluate(node => {
        const ys = [...node.querySelectorAll('input, button')]
          .filter(el => el.getBoundingClientRect().width > 0)
          .map(el => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2))
        return new Set(ys.map(y => Math.round(y / 12))).size
      })
      expect(filas, `@${width}: barra de herramientas en una fila`).toBe(1)
      await expect(page.getByTestId('barra-pedidos').getByRole('button', { name: 'Actualizar', exact: true })).toHaveCount(0)
    }
    if (width >= 1280) {
      await mkdir(out, { recursive: true })
      await page.screenshot({ path: `${out}/densidad-pedidos-${width}.png` })
    }
    expect(m.hscroll, `@${width}: sin scroll horizontal`).toBe(false)
    await expect(strip.getByText('En pantalla', { exact: true })).toHaveCount(1)
    if (width >= 1280) {
      if (m.listaTop !== null) expect(m.listaTop, `@${width}: la lista empieza ≤ y=300`).toBeLessThanOrEqual(300)
    }
    // Una línea: ≤ 64px de alto y todas las métricas en la misma fila (en celular la tira se desplaza).
    expect(m.stripH, `@${width}: tira ≤ 64px`).toBeLessThanOrEqual(64)
    expect(new Set(m.tiles.map(t => t.y)).size, `@${width}: KPI en una sola fila`).toBe(1)
  }
})

test('Clientes: barra de herramientas en UNA fila a 1440 y KPI de una línea (#388)', async ({ page }) => {
  await enterDemo(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await openShellDestination(page, 'Clientes')
  await settle(page)
  const barra = page.getByTestId('barra-clientes')
  await expect(barra).toBeVisible()
  const m = await barra.evaluate(node => {
    const ys = [...node.querySelectorAll('input, button, select')]
      .filter(el => el.getBoundingClientRect().width > 0)
      .map(el => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2))
    const search = node.querySelector('[data-slot="search"]').getBoundingClientRect()
    return { filas: new Set(ys.map(y => Math.round(y / 12))).size, searchW: Math.round(search.width) }
  })
  expect(m.filas, 'buscador · chips · orden · vista · acción en una fila').toBe(1)
  expect(m.searchW, 'buscador 320–420px').toBeGreaterThanOrEqual(320)
  expect(m.searchW, 'buscador 320–420px').toBeLessThanOrEqual(421)
  const strip = await page.getByTestId('resumen-clientes').boundingBox()
  expect(strip.height, 'KPI ≤ 64px').toBeLessThanOrEqual(64)
  // El aviso de la demo no es una fila propia ni un párrafo en la barra.
  await expect(barra.getByText('Demo local')).toHaveCount(0)
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
  // Orden y vista viven detrás de UN botón de 44px («Ordenar / Vista»).
  const alternar = orders.getByRole('button', { name: 'Ordenar / Vista', exact: true })
  expect((await alternar.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await alternar.click()
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

// Detail pages use the compact record header (back · title · chip · meta ·
// actions in one row, no section tabs row, no list H1).
for (const [width, height, maxTop, maxHeader] of [
  [1440, 900, 120, 72],
  // #387: en celular el encabezado suma la fila de acciones (flechas, Devolver,
  // imprimir, POS, Más acciones) que antes vivía en el cuerpo del pedido.
  [375, 812, 188, 140],
]) {
  test(`Detalle de pedido: encabezado compacto a ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await openShellDestination(page, 'Pedidos')
    await settle(page)
    await page.getByTestId('pedido-fila').first().click()
    await expect(page.getByTestId('pedido-detalle-f3')).toBeVisible()
    await settle(page)
    const header = page.getByTestId('record-header')
    await expect(header).toBeVisible()
    await expect(page.getByTestId('shell-contexto')).toHaveCount(0)
    await expect(page.getByTestId('shell-pestanas')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^[A-Z]{2,}-#?\d+/)
    const back = page.getByTestId('record-header-back')
    expect((await back.boundingBox()).height, 'volver 44px').toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId('volver-al-pos')).toBeVisible()
    const box = await header.boundingBox()
    const first = await page.getByTestId('pedido-detalle-f3').boundingBox()
    expect(box.height, 'alto del encabezado').toBeLessThanOrEqual(maxHeader)
    expect(first.y, 'primer contenido').toBeLessThanOrEqual(maxTop)
    expect(first.y - (box.y + box.height), 'aire entre encabezado y contenido').toBeLessThanOrEqual(12)
    if (width >= 1024) {
      const h1 = await page.getByRole('heading', { level: 1 }).boundingBox()
      const pos = await page.getByTestId('volver-al-pos').boundingBox()
      expect(Math.abs(h1.y + h1.height / 2 - (pos.y + pos.height / 2)), 'una sola fila').toBeLessThanOrEqual(24)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'scroll horizontal').toBe(false)
    await page.screenshot({ path: `${out}/detalle-pedido-${width}.png` })
    await back.click()
    await expect(page.getByTestId('ventas-pedidos-f3')).toBeVisible()
    await expect(page.getByTestId('record-header')).toHaveCount(0)
  })
}

// #615: el encabezado de un pedido comparte un único ritmo vertical con los
// selectores del shell. Medimos los controles reales (incluido el badge de
// notificaciones) para evitar que una regla de una pantalla vuelva a desfasar
// la barra en otra resolución o con el rail plegado.
for (const width of [360, 390, 768, 1024, 1280, 1440]) {
  for (const dark of [false, true]) {
    test(`#615 encabezado del pedido centrado ${width}px ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 })
      await enterDemo(page)
      if (dark) await setDark(page)
      await openShellDestination(page, 'Pedidos')
      await settle(page)
      await page.getByTestId('pedido-fila').first().click()
      await expect(page.getByTestId('record-header')).toBeVisible()
      await settle(page)

      const controls = page.locator([
        '[data-testid="record-header-back"]',
        '[data-testid="pedido-anterior"]',
        '[data-testid="pedido-siguiente"]',
        '[data-testid="pedido-acciones"] > button',
        '[data-testid="pedido-acciones"] [role="group"] > button',
        '[data-testid="pedido-acciones"] > span[role="button"]',
        '[data-testid="shell-sucursal-desktop"]:visible',
        '[data-testid="notificaciones-aviso"]:visible',
        '[data-testid="shell-tema"]:visible',
      ].join(','))
      const validar = async (rail) => {
        const geometry = await controls.evaluateAll(nodes => nodes
          .map(node => {
            const r = node.getBoundingClientRect()
            return { testid: node.dataset.testid || node.getAttribute('aria-label') || node.textContent.trim().slice(0, 20), x: r.x, y: r.y, width: r.width, height: r.height }
          })
          .filter(item => item.width > 0 && item.height > 0))
        expect(geometry.length, 'controles visibles del encabezado').toBeGreaterThanOrEqual(width >= 1024 ? 6 : 4)
        if (width >= 1280) {
          const centers = geometry.map(item => item.y + item.height / 2)
          expect(Math.max(...centers) - Math.min(...centers), `centros alineados con rail ${rail}`).toBeLessThanOrEqual(2)
        } else {
          // En celular la barra puede ocupar dos filas; cada fila es una unidad
          // intencional y sus controles deben seguir compartiendo centro.
          const rows = new Map()
          for (const item of geometry) {
            const row = Math.round(item.y)
            const centers = rows.get(row) || []
            centers.push(item.y + item.height / 2)
            rows.set(row, centers)
          }
          for (const centers of rows.values())
            expect(Math.max(...centers) - Math.min(...centers), 'centros verticales en cada fila móvil').toBeLessThanOrEqual(2)
        }
        for (const item of geometry) {
          expect(item.height, `${item.testid} target`).toBeGreaterThanOrEqual(44)
          expect(item.x, `${item.testid} x`).toBeGreaterThanOrEqual(-1)
          expect(item.x + item.width, `${item.testid} ancho`).toBeLessThanOrEqual(width + 1)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `sin overflow horizontal ${rail}`).toBe(false)
        if (process.env.MOBOS_615_SHOTS === '1')
          await page.screenshot({ path: `/tmp/mobos-ui-615/${width}-${dark ? 'dark' : 'light'}-${rail}.png` })
      }

      if (width >= 1024) {
        await validar('expandido')
        const collapse = page.getByTestId('shell-lateral').getByRole('button', { name: 'Colapsar menú', exact: true })
        await collapse.click()
        await expect(page.getByTestId('shell')).toHaveAttribute('data-shell-collapsed', '1')
        await validar('plegado')
      } else await validar('móvil')
    })
  }
}

// Taller (#396/#448): cápsulas con borde de 1 y 2 por fila en celular y tablet y,
// desde 1280 px, una fila fina por orden (≤ 48 px). La primera orden va a la vista
// sin cabeceras apiladas.
for (const [width, height, columnas] of [
  [375, 812, 1],
  [768, 1024, 2],
  [1280, 900, 1],
  [1440, 900, 1],
]) {
  test(`Taller en cápsulas: ${columnas} por fila a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await page.goto('/servicio')
    const filas = page.getByTestId('servicio-fila')
    await expect(filas.first()).toBeVisible()
    await settle(page)
    const cajas = await filas.evaluateAll(nodos =>
      nodos.map(nodo => {
        const r = nodo.getBoundingClientRect()
        const estilo = getComputedStyle(nodo)
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), borde: estilo.borderTopWidth, radio: estilo.borderTopLeftRadius }
      }),
    )
    await mkdir(out, { recursive: true })
    await page.screenshot({ path: `${out}/taller-capsulas-${width}.png` })
    const primeraFila = cajas.filter(caja => Math.abs(caja.y - cajas[0].y) <= 2)
    expect(primeraFila.length, 'cápsulas en la primera fila').toBe(Math.min(columnas, cajas.length))
    expect(cajas[0].borde, 'borde visible').toBe('1px')
    expect(parseFloat(cajas[0].radio), 'radio').toBeGreaterThan(0)
    if (width >= 1440) expect(cajas[0].y, 'primera orden a la vista').toBeLessThanOrEqual(300)
    // #448: en escritorio la orden es una fila fina.
    if (width >= 1280) {
      const altos = await filas.evaluateAll(nodos => nodos.slice(0, 6).map(nodo => Math.round(nodo.getBoundingClientRect().height)))
      for (const alto of altos) expect(alto, 'alto de la fila de Taller').toBeLessThanOrEqual(48)
    }
    // Sin código interno repetido ni casillas fuera del modo selección.
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(filas.first()).not.toContainText('AUR-OS')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'scroll horizontal').toBe(false)
  })
}

// #387 · Pedidos densos: tira de KPI con período y mini-gráficos; página de
// pedido en dos columnas (lateral ≤ 360px) en escritorio y una en celular.
test('Pedidos: KPI de una línea con período «Hoy», cinco métricas y mini-gráficos a 1440', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await openShellDestination(page, 'Pedidos')
  await settle(page)
  const strip = page.getByTestId('resumen-pedidos')
  await expect(strip).toBeVisible()
  await expect(page.getByTestId('kpi-periodo')).toHaveText('Hoy')
  for (const titulo of ['Pedidos', 'Artículos', 'Devoluciones', 'Preparados', 'Entregados'])
    await expect(strip.getByText(titulo, { exact: true })).toHaveCount(1)
  await expect(strip.getByTestId('kpi-grafico')).toHaveCount(5)
  expect((await strip.boundingBox()).height, 'KPI ≤ 64px').toBeLessThanOrEqual(64)
  const columnas = await page.getByTestId('pedidos-tabla').locator('.ventas-f3-list-header > button').allInnerTexts()
  expect(columnas.map(texto => texto.replace(/[↑↓]/g, '').trim())).toEqual(['Pedido', 'Fecha', 'Cliente / artículos', 'Canal', 'Pago', 'Estado', 'Total'])
  await page.getByTestId('kpi-periodo').click()
  await page.getByRole('menuitem', { name: '7 días', exact: true }).click()
  await expect(page.getByTestId('kpi-periodo')).toHaveText('7 días')
})

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`Página de pedido: ${width >= 1024 ? 'dos columnas con lateral ≤ 360px' : 'una columna sin scroll horizontal'} a ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await page.setViewportSize({ width, height })
    await enterDemo(page)
    await openShellDestination(page, 'Pedidos')
    await settle(page)
    await page.getByTestId('pedido-fila').first().click()
    await expect(page.getByTestId('pedido-pagina-f3')).toBeVisible()
    await settle(page)
    const main = await page.locator('.ventas-f3-page-main').boundingBox()
    const side = await page.getByTestId('pedido-lateral').boundingBox()
    if (width >= 1024) {
      expect(side.x, 'lateral a la derecha').toBeGreaterThan(main.x + main.width - 1)
      expect(side.width, 'lateral ≤ 360px').toBeLessThanOrEqual(360)
      expect(Math.abs(side.y - main.y), 'columnas alineadas arriba').toBeLessThanOrEqual(24)
    } else {
      expect(Math.abs(side.x - main.x), 'una sola columna').toBeLessThanOrEqual(1)
      expect(side.y + side.height, 'lateral antes del cuerpo').toBeLessThanOrEqual(main.y + 1)
    }
    for (const id of ['pedido-articulos', 'pedido-pago', 'pedido-notas', 'pedido-cliente', 'pedido-entrega']) await expect(page.getByTestId(id)).toBeVisible()
    await expect(page.getByTestId('pedido-chips')).toBeVisible()
    await expect(page.getByTestId('pedido-siguiente')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'scroll horizontal').toBe(false)
    await page.screenshot({ path: `${out}/pedido-pro-${width}.png`, fullPage: true })
  })
}


// #396/#370: controles utilizables y contenido dentro de la pantalla en cada breakpoint.
for (const dark of [false, true]) {
  test(`#396 responsive de Taller, Productos y Comparador ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(120_000)
    await enterDemo(page)
    if (dark) await setDark(page)
    for (const width of [360, 375, 390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      for (const [ruta, selector] of [['/servicio', '.taller-f3'], ['/productos', '[data-testid="seller-section"]'], ['/comparador', '[data-testid="barra-comparador"]']]) {
        await page.goto(ruta)
        await settle(page)
        const root = ruta === '/servicio' ? page.locator(selector) : page.locator('main').first()
        await expect(root).toBeVisible()
        const medidas = await root.evaluate(el => {
          const visible = nodo => nodo.getClientRects().length && getComputedStyle(nodo).visibility !== 'hidden'
          const botones = [...el.querySelectorAll('button')].filter(visible)
          return {
            scroll: document.documentElement.scrollWidth > innerWidth,
            interiores: [...el.querySelectorAll('[data-testid="catalogo-tabla"], [data-testid="servicio-tabla"]')].filter(visible).map(nodo => ({ ancho: nodo.clientWidth, contenido: nodo.scrollWidth })),
            pequenos: botones.filter(nodo => { const r = nodo.getBoundingClientRect(); return r.height < 43.9 || r.width < 43.9 }).map(nodo => nodo.getAttribute('aria-label') || nodo.textContent.trim() || nodo.title),
            primeraOrden: el.querySelector('[data-testid="servicio-fila"]')?.getBoundingClientRect().top,
          }
        })
        const etiqueta = `${ruta} ${width}px ${dark ? 'dark' : 'light'}`
        console.log('RESPONSIVE', etiqueta, JSON.stringify({ ...medidas, pequenos: width < 1024 ? medidas.pequenos : undefined }))
        expect.soft(medidas.scroll, etiqueta).toBe(false)
        for (const caja of medidas.interiores) expect.soft(caja.contenido, etiqueta).toBeLessThanOrEqual(caja.ancho)
        if (width < 1024) expect.soft(medidas.pequenos, etiqueta).toEqual([])
        if (ruta === '/servicio' && width < 640) expect.soft(medidas.primeraOrden, 'Primera orden accesible sin nueve filas de controles').toBeLessThanOrEqual(430)
      }
    }
  })
}


test('#448 Taller vuelve a Servicio y arriba al regresar desde otra sección', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await openShellDestination(page, 'Taller y garantías')
  await page.locator('.taller-f3').getByRole('button', { name: 'Más acciones', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Ver tablero', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Ver taller o garantías', exact: true }).getByRole('button', { name: 'Tablero', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => window.scrollTo(0, 900))
  await openShellDestination(page, 'Inicio')
  await openShellDestination(page, 'Taller y garantías')
  await expect(page.locator('.taller-f3')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Ver taller o garantías', exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})


test('#396 Productos tablet: selección accesible independiente de abrir la ficha', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await enterDemo(page)
  await openShellDestination(page, 'Productos')
  const fila = page.getByTestId('producto-fila').first()
  const casilla = fila.getByRole('checkbox')
  await casilla.focus()
  await page.keyboard.press('Space')
  await expect(casilla).toBeChecked()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await fila.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})


for (const dark of [false, true]) {
  test(`#396 Configuración móvil y aviso demo legibles ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    await enterDemo(page)
    if (dark) await setDark(page)
    for (const width of [375, 390, 768]) {
      await page.setViewportSize({ width, height: 900 })
      await openShellDestination(page, 'Configuración')
      const lista = page.getByTestId('config-grupos')
      await expect(lista.locator('[data-tab-id]')).toHaveCount(7)
      for (const item of await lista.locator('[data-tab-id]').all()) {
        expect((await item.boundingBox()).height).toBeGreaterThanOrEqual(44)
      }
      const aviso = page.getByTestId('demo-aviso')
      const marco = await aviso.boundingBox()
      for (const boton of await aviso.getByRole('button').all()) {
        const caja = await boton.boundingBox()
        // Los enlaces compactos usan la superficie táctil ::after del kit compartido.
        const altoTactil = await boton.evaluate(el => Math.max(el.getBoundingClientRect().height, parseFloat(getComputedStyle(el, '::after').height) || 0))
        expect(altoTactil).toBeGreaterThanOrEqual(44)
        expect(caja.x).toBeGreaterThanOrEqual(marco.x)
        expect(caja.x + caja.width).toBeLessThanOrEqual(marco.x + marco.width)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    }
  })
}
