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

  const cliente = page.getByPlaceholder('Buscar cliente o escribir un nombre nuevo')
  await cliente.fill('Mar')
  await expect(page.getByTestId('pos-bloque-cliente').getByRole('button').first()).toBeVisible()
  await cliente.press('Enter')
  await expect(page.getByTestId('cliente-elegido-nombre')).toContainText('María')

  const productos = page.locator('#pos-busqueda-producto input')
  await expect(productos).toBeFocused()
  await productos.fill('Funda MagSafe')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('1 producto')

  await page.getByRole('button', { name: 'Agregar otro', exact: true }).click()
  await expect(productos).toBeFocused()
  await productos.fill('Cable USB')
  await productos.press('Enter')
  await expect(page.getByTestId('pos-bloque-carrito')).toContainText('2 productos')

  await page.getByRole('button', { name: 'Cobrar F2', exact: true }).click()
  await expect(page.getByTestId('pos-cobro')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
})

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
