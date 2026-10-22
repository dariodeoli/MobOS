import { test, expect } from '@playwright/test'

async function enter(page, width, form = false) {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => { sessionStorage.setItem('mobos:demo-session', 'active'); sessionStorage.setItem('mobos:demo-session:role', 'ADMIN') })
  await page.route(/https:\/\//, route => route.abort())
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.continue())
  await page.goto(`/e2e/fixtures/precios559.html${form ? '?form=1' : ''}`)
}
const price = amount => ({ unitPricePyg: amount, unitPricePygFallback: amount, currency: 'PYG', origin: 'LIST' })
for (const width of [390, 1440]) {
  test(`559 quotes follow context, ignore stale responses and show partial/errors honestly ${width}`, async ({ page }) => {
    let release, delayed
    const started = new Promise(resolve => { delayed = resolve })
    const blocked = new Promise(resolve => { release = resolve })
    let branchRelease, branchDelayed, initialBranch
    const branchStarted = new Promise(resolve => { branchDelayed = resolve })
    const branchBlocked = new Promise(resolve => { branchRelease = resolve })
    let mode = 'normal'
    await enter(page, width)
    await page.route('**/api/pricing?**', async route => {
      const query = new URL(route.request().url()).searchParams
      expect(query.get('quantity')).toBe('1')
      const customer = query.get('customerId')
      initialBranch ||= query.get('branch')
      const otherBranch = query.get('branch') !== initialBranch
      const value = (mode === 'zero' ? 0 : customer === 'B' ? 220000 : 110000) + (mode === 'slowbranch' && otherBranch ? 50000 : 0)
      if (mode === 'slowbranch' && otherBranch) { branchDelayed(); await branchBlocked }
      if (mode === 'slow' && customer === 'A') { delayed(); await blocked }
      if (mode === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ priceList: { name: `Lista ${customer}` }, prices: mode === 'invalid' ? { p1: price(false), p2: price(' ') } : mode === 'partial' ? { p1: price(value) } : { p1: price(value), p2: price(value + 10000) } }) })
    })
    await page.getByRole('button', { name: 'Cliente B', exact: true }).click()
    const card = page.locator('.pos-product-card').first()
    await expect(card).not.toContainText('110.000')
    await expect(card).toContainText('220.000')
    await expect(card.getByTestId('pos-stock-por-sucursal')).toContainText('3')
    mode = 'slow'
    await page.getByRole('button', { name: 'Cliente A', exact: true }).click()
    await started
    await expect(card).toContainText('Consultando precio')
    await expect(card).not.toContainText('220.000')
    await page.getByRole('button', { name: 'Cliente B', exact: true }).click()
    await expect(card).toContainText('220.000')
    const staleCustomer = page.waitForResponse(response => new URL(response.url()).searchParams.get('customerId') === 'A')
    release()
    await staleCustomer
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(card).not.toContainText('110.000')
    mode = 'slowbranch'
    await page.getByRole('button', { name: 'Sucursal 2', exact: true }).click()
    await branchStarted
    await expect(card).toContainText('Consultando precio')
    await page.getByRole('button', { name: 'Sucursal 1', exact: true }).click()
    await expect(card).toContainText('220.000')
    const staleBranch = page.waitForResponse(response => new URL(response.url()).searchParams.get('branch') !== initialBranch && response.url().includes('/api/pricing?'))
    branchRelease()
    await staleBranch
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(card).not.toContainText('270.000')
    await page.screenshot({ path: `/tmp/mobos559-normal-${width}.png`, fullPage: true })
    mode = 'partial'
    await page.getByRole('button', { name: 'Sucursal 2', exact: true }).click()
    await expect(card).toContainText('Precio no disponible')
    await card.click()
    const dialog = page.getByRole('dialog', { name: 'Elegí la variante' })
    await expect(dialog.getByTestId('variante-opcion').first()).toContainText('220.000')
    await expect(dialog.getByTestId('variante-opcion').last()).toContainText('Precio no disponible')
    await expect(dialog.getByTestId('variante-opcion').first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(dialog.getByTestId('variante-opcion').last()).toBeFocused()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Stock inválido', exact: true }).click()
    await expect(card.getByTestId('pos-stock-por-sucursal')).toContainText('Sin dato')
    await expect(card.getByTestId('pos-stock-por-sucursal')).not.toContainText('Agotado')
    mode = 'invalid'
    await page.getByRole('button', { name: 'Sucursal 1', exact: true }).click()
    await expect(card).toContainText('Precio no disponible')
    await expect(card.getByTestId('pos-precio-aplicable')).not.toContainText('Gs. 0')
    mode = 'zero'
    await page.getByRole('button', { name: 'Stock cero', exact: true }).click()
    await page.getByRole('button', { name: 'Sucursal 2', exact: true }).click()
    await expect(card.getByTestId('pos-precio-aplicable')).toContainText('Gs 0')
    await expect(card.getByTestId('pos-stock-por-sucursal')).toContainText('Agotado')
    mode = 'error'
    await page.getByRole('button', { name: 'Sucursal 1', exact: true }).click()
    await expect(card).toContainText('Precio no disponible')
    await expect(card).not.toContainText('999.999')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/mobos559-${width}.png`, fullPage: true })
  })
}

test('559 FormularioVenta connects its display-only pricing callback for one unit', async ({ page }) => {
  await enter(page, 1440, true)
  const requests = []
  await page.route('**/api/pricing?**', async route => {
    const query = new URL(route.request().url()).searchParams
    requests.push(Object.fromEntries(query))
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...price(123456), priceList: { name: 'Cotización QA' } }) })
  })
  // Change branch after installing the transport so the actual Form callback reruns.
  await page.getByRole('button', { name: 'Sucursal 2', exact: true }).click()
  await expect(page.getByTestId('pos-precio-aplicable').first()).toContainText('123.456')
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every(query => query.quantity === '1' && query.productId)).toBe(true)
  await expect(page.getByTestId('pos-carrito-cuerpo')).not.toContainText('123.456')
})
