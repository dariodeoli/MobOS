import { test, expect } from '@playwright/test'

async function enterDemo(page) {
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
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const nav = page.viewportSize().width < 1024
    ? page.getByTestId('shell-bottom-nav')
    : page.getByTestId('shell-lateral')
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
}

test('venta rápida: Enter confirma cliente, enfoca productos y cobra con F2', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)

  const card = page.locator('.pos-product-card').first()
  const style = await card.evaluate(element => ({ padding: getComputedStyle(element).paddingTop, width: element.getBoundingClientRect().width }))
  expect(style.padding).toBe('12px')
  expect(style.width).toBeGreaterThanOrEqual(180)
  await expect(card.getByTestId('foto-producto')).toHaveCSS('width', '64px')

  const cliente = page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')
  await cliente.fill('Mar')
  await expect(page.getByTestId('pos-bloque-cliente').getByRole('button').first()).toBeVisible()
  await cliente.press('Enter')
  await expect(page.getByTestId('cliente-elegido-nombre')).toContainText('María')

  const productos = page.locator('#pos-busqueda-producto input')
  await expect(productos).toBeFocused()
  const [searchBox, catalogBox] = await Promise.all([productos.boundingBox(), page.getByTestId('pos-bloque-productos').boundingBox()])
  expect(searchBox.width).toBeGreaterThan(catalogBox.width * 0.85)
  await productos.fill('Funda MagSafe')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')

  await page.getByRole('button', { name: 'Agregar otro', exact: true }).click()
  await expect(productos).toBeFocused()
  await productos.fill('Cable USB-C')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('2 productos')

  await page.keyboard.press('F2')
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
  await expect(page.getByTestId('pos-cobro-header')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

test('venta rápida vacía mantiene el cobro progresivo junto al catálogo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  await expect(page.getByTestId('pos-cobro')).toHaveCount(0)
  await expect(page.getByTestId('pos-cobro-header')).toHaveCount(0)
  await expect(page.getByTestId('pos-cobro-cta')).toHaveCount(0)
  await expect(page.locator('#pos-busqueda-producto input')).toBeVisible()
})

test('venta rápida: las variantes se pueden recorrer con flechas y confirmar con Enter', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await enterDemo(page)
  const cards = page.locator('.pos-product-card')
  const familias = await cards.allTextContents()
  const indice = familias.findIndex(text => /desde/i.test(text))
  expect(indice, `familia con variantes visible: ${familias.join(' | ')}`).toBeGreaterThanOrEqual(0)
  await cards.nth(indice).click()
  const selector = page.getByTestId('selector-variante')
  await expect(selector).toBeVisible()
  const opciones = selector.getByTestId('variante-opcion')
  await expect(opciones).toHaveCount(2)
  await expect(opciones.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(opciones.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(selector).toBeHidden()
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')
})

for (const width of [1280, 768, 430, 393, 360]) {
  test(`venta rápida conserva layout y acciones accesibles a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1024 ? 844 : 900 })
    await enterDemo(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width < 640) {
      await expect(page.getByTestId('pos-movil')).toBeVisible()
      const search = page.getByPlaceholder('Buscar producto…')
      await expect(search).toBeVisible()
      const searchBox = await search.boundingBox()
      expect(searchBox.height).toBeGreaterThanOrEqual(44)
    } else {
      await expect(page.getByTestId('pos-bloque-productos')).toBeVisible()
      await expect(page.getByTestId('pos-bloque-carrito')).toBeVisible()
    }
  })
}

test('venta rápida conserva objetivos táctiles y no desborda en celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await enterDemo(page)
  await expect(page.getByTestId('pos-movil')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  const search = page.getByPlaceholder('Buscar producto…')
  const box = await search.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
})

test('cobro: título y acciones de pagos mantienen separación en desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await enterDemo(page)
  const firstCard = await page.locator('.pos-product-card').first().boundingBox()
  expect(firstCard.width).toBeGreaterThanOrEqual(160)
  await page.locator('.pos-product-card', { hasText: 'Funda MagSafe' }).first().click()
  await page.getByTestId('carrito-listo').click()
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro).toBeVisible()
  const titulo = cobro.getByText('Pagos de esta venta', { exact: true })
  const agregar = cobro.getByRole('button', { name: '+ Agregar pago', exact: true })
  const gift = cobro.getByRole('button', { name: '+ Canjear gift card', exact: true })
  const [t, a, g] = await Promise.all([titulo.boundingBox(), agregar.boundingBox(), gift.boundingBox()])
  const overlap = (one, two) => one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height
  expect(overlap(t, a)).toBe(false)
  expect(overlap(t, g)).toBe(false)
})

test('venta rápida: divisor queda alineado al borde real de las columnas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const divisor = page.getByTestId('pos-divisor')
  const layout = page.getByTestId('pos-layout')
  const izquierda = page.locator('.pos-col-izq')
  const before = await Promise.all([divisor.boundingBox(), izquierda.boundingBox(), layout.evaluate(element => Number.parseFloat(getComputedStyle(element).columnGap))])
  expect(Math.abs((before[0].x + before[0].width / 2) - (before[1].x + before[1].width + before[2] / 2))).toBeLessThanOrEqual(2)
  await divisor.focus()
  await page.keyboard.press('ArrowRight')
  const after = await Promise.all([divisor.boundingBox(), izquierda.boundingBox()])
  expect(after[0].x + after[0].width / 2).toBeGreaterThan(before[0].x + before[0].width / 2)
})
