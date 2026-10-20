import { test, expect } from '@playwright/test'

async function enterPos(page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:aviso-metricas', '1')
  })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await page.getByTestId('shell-lateral').getByRole('button', { name: 'Vender', exact: true }).click()
  await expect(page.getByTestId('pos-bloque-cliente')).toBeVisible()
}

test('checkout: Enter confirma y el botón OK colapsa la ficha del cliente', async ({ page }) => {
  await enterPos(page)
  const cliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  await cliente.fill('Luc')
  await page.getByTestId('pos-bloque-cliente').locator('button.block').first().click()
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  await page.getByRole('button', { name: 'Editar datos del cliente', exact: true }).click()
  await expect(page.getByTestId('confirmar-cliente')).toBeVisible()
  await page.getByLabel('Teléfono del cliente').fill('981 555 123')
  await page.getByLabel('Teléfono del cliente').press('Enter')
  await expect(page.getByTestId('confirmar-cliente')).toHaveCount(0)
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  await expect(page.getByTestId('cliente-guardado')).toContainText('Cliente listo')
})

test('checkout: muestra facturación alternativa y direcciones guardadas sin perder ids', async ({ page }) => {
  await enterPos(page)
  const cliente = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')
  await cliente.fill('María González')
  await expect(page.getByTestId('cliente-elegido')).toBeVisible()
  const elegido = page.getByTestId('cliente-elegido')
  await expect(elegido.getByTestId('cliente-direcciones-guardadas')).toBeVisible()
  await elegido.getByRole('button', { name: 'Facturar a otro', exact: true }).click()
  await expect(page.getByLabel(/Facturar a otro titular/)).toBeChecked()
  await expect(page.getByLabel('Nombre del titular de factura')).toBeVisible()
  await expect(page.getByLabel('RUC del titular de factura')).toBeVisible()
})

test('checkout: carrito y pagos no crean scroll interno en desktop', async ({ page }) => {
  await enterPos(page)
  await page.locator('.pos-product-card', { hasText: 'Funda MagSafe' }).first().click()
  const carrito = page.getByTestId('pos-bloque-carrito')
  await expect(carrito).toContainText('1 producto')
  await page.getByTestId('carrito-listo').click()
  const cobro = page.getByTestId('pos-cobro')
  await expect(cobro).toBeVisible()
  await cobro.getByRole('button', { name: '+ Agregar pago', exact: true }).click()
  const estilos = await page.evaluate(() => ({
    carrito: getComputedStyle(document.querySelector('[data-testid="pos-carrito-cuerpo"]')).overflowY,
    pagos: getComputedStyle(document.querySelector('[data-testid="pos-pagos-lista"]')).overflowY,
  }))
  expect(estilos.carrito).toBe('visible')
  expect(estilos.pagos).toBe('visible')
})
