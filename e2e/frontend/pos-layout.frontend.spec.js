import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// POS redesign (owner feedback): sin solapes, teléfono en una fila, catálogo
// denso y sin scroll horizontal. Demo frontend-only (sin backend).
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-pos-layout-qa'

async function enterPos(page, width, height = 900, dark = false, conCarrito = false) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }))
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  if (conCarrito) await seedCart(page)
  const nav = width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

async function seedCart(page) {
  await expect.poll(() => page.evaluate(async () => (await import('/src/lib/storage.js')).getProductos().length)).toBeGreaterThan(0)
  await page.evaluate(async () => {
    const storage = await import('/src/lib/storage.js')
    const cart = await import('/src/lib/posCart.js')
    const c = storage.contextoActual()
    const product = storage.getProductos().find(p => /Funda/.test(p.nombre)) || storage.getProductos()[0]
    cart.guardarCarrito(c.empresaId, c.sucursalId, c.userId, {
      items: [{ key: 'qa-1', productoId: product.id, nombre: product.nombre, quantity: 1, precio: 180000, sobrePedido: true }],
      customer: { name: 'Prueba frontend local' },
      pagos: [],
    })
  })
}

const inter = (a, b) => a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1

async function assertNoOverlap(page, label) {
  const ids = ['pos-bloque-carrito', 'pos-cobro']
  for (const scrollY of [0, 300, 700]) {
    await page.evaluate(y => window.scrollTo(0, y), scrollY)
    await page.waitForTimeout(100)
    const boxes = {}
    for (const id of ids) boxes[id] = await page.getByTestId(id).boundingBox()
    const probes = {
      cart: boxes['pos-bloque-carrito'],
      cobro: boxes['pos-cobro'],
      entrega: await page.locator('#entrega').boundingBox(),
      monto: await page.locator('#monto-entrega').boundingBox(),
      pagos: await page.getByTestId('pos-bloque-pagos').boundingBox(),
      agregar: await page.getByRole('button', { name: '+ Agregar pago' }).boundingBox(),
      gift: await page.getByRole('button', { name: '+ Canjear gift card' }).boundingBox(),
      subtotal: await page.getByTestId('carrito-total').boundingBox(),
      tiles: await page.getByTestId('pos-tiles-resumen').boundingBox(),
    }
    const names = Object.keys(probes)
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = probes[names[i]], b = probes[names[j]]
      const nested = (x, y) => x.x >= y.x - 1 && x.y >= y.y - 1 && x.x + x.width <= y.x + y.width + 1 && x.y + x.height <= y.y + y.height + 1
      if (nested(a, b) || nested(b, a)) continue
      expect(inter(a, b), `${label} scroll ${scrollY}: ${names[i]} solapa ${names[j]}`).toBe(false)
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

for (const width of [1280, 1440, 1920, 390]) {
  test(`POS sin solapes ni scroll horizontal a ${width}px`, async ({ page }) => {
    await mkdir(out, { recursive: true })
    await enterPos(page, width, 900, false, true)
    await assertNoOverlap(page, `${width}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    // Los importes completos no se cortan.
    const total = page.getByTestId('carrito-total')
    expect(await total.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await expect(total).toContainText('Gs 180.000')
  })
}

test('POS 375px sin scroll horizontal', async ({ page }) => {
  await enterPos(page, 375, 900, false, true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('catálogo denso: ≥12 productos sobre el pliegue a 1440x900 y una sola franja de acciones', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900)
  const cards = page.locator('.pos-product-card')
  await expect.poll(() => cards.count()).toBeGreaterThan(11)
  const boxes = await cards.evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { y: r.y, b: r.bottom, h: r.height, w: r.width } }))
  expect(boxes.filter(b => b.b <= 900).length).toBeGreaterThanOrEqual(12)
  for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44)
  // «Más» vive en el encabezado de Productos, no en una franja aparte.
  const head = await page.getByTestId('pos-bloque-productos').boundingBox()
  const mas = await page.getByTestId('pos-mas').boundingBox()
  expect(mas.y).toBeGreaterThanOrEqual(head.y)
  expect(mas.y + mas.height).toBeLessThanOrEqual(head.y + 70)
  await page.screenshot({ path: `${out}/1440-pos-light.png` })
})

test('teléfono: código y número en una sola fila, RUC aparte y a ancho completo', async ({ page }) => {
  await enterPos(page, 1440, 900)
  await page.getByTestId('pos-bloque-cliente').getByText('Datos de contacto, RUC/CI y direcciones').click()
  const code = await page.getByRole('combobox', { name: 'Código de país' }).or(page.getByRole('button', { name: /Código de país/ })).first().boundingBox()
  const num = await page.getByLabel('Teléfono del cliente').boundingBox()
  expect(Math.abs((code.y + code.height / 2) - (num.y + num.height / 2))).toBeLessThan(6)
  expect(num.x).toBeGreaterThanOrEqual(code.x + code.width - 1)
  const panel = await page.getByTestId('pos-bloque-cliente').boundingBox()
  expect(num.x + num.width).toBeGreaterThan(panel.x + panel.width * 0.8)
  const ruc = await page.getByLabel('CI o RUC del cliente').last().boundingBox()
  expect(ruc.width).toBeGreaterThan(panel.width * 0.7)
  await page.screenshot({ path: `${out}/1440-cliente.png` })
})

test('POS oscuro a 1440 sin solapes', async ({ page }) => {
  await mkdir(out, { recursive: true })
  await enterPos(page, 1440, 900, true, true)
  await assertNoOverlap(page, 'dark')
  await page.getByTestId('pos-cobro').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/1440-pos-cobro.png` })
})
