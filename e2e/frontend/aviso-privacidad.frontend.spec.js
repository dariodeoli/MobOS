import { test, expect } from '@playwright/test'

// Aviso de métricas anónimas + «No medir» (landing, demo y /privacidad).
// Frontend-only: el API de medición se simula y se cuentan los envíos.
async function preparar(page) {
  const envios = []
  await page.route('**/api/public/track', route => {
    envios.push(route.request().postData() || '')
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route(/https:\/\//, route => route.abort())
  return envios
}

async function sinScrollHorizontal(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
}

for (const [ancho, alto] of [
  [360, 740],
  [390, 844],
]) {
  test(`aviso: aparece una vez, se descarta y no vuelve (${ancho}px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await preparar(page)
    await page.goto('/landing-preview', { waitUntil: 'domcontentloaded' })
    const aviso = page.getByTestId('aviso-metricas')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText(
      'Usamos métricas anónimas para mejorar MobOS. Sin datos personales.',
    )
    await expect(aviso.getByRole('link', { name: 'Más info' })).toHaveAttribute(
      'href',
      '/privacidad',
    )
    await sinScrollHorizontal(page)
    for (const control of [
      aviso.getByRole('link', { name: 'Más info' }),
      aviso.getByRole('button', { name: 'Cerrar aviso' }),
    ]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(43.5)
    }
    await aviso.getByRole('button', { name: 'Cerrar aviso' }).click()
    await expect(aviso).toHaveCount(0)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByTestId('aviso-metricas')).toHaveCount(0)
  })
}

for (const ancho of [390, 1440]) {
  test(`aviso: el enlace de Owncoding puede quedar libre al final (${ancho}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 })
    await preparar(page)
    await page.goto('/landing-preview', { waitUntil: 'domcontentloaded' })
    const aviso = page.getByTestId('aviso-metricas')
    const owncoding = page.getByRole('link', { name: /Desarrollado por Owncoding/ })
    await expect(aviso).toBeVisible()
    await owncoding.waitFor({ state: 'visible' })
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const avisoBox = await aviso.boundingBox()
    const linkBox = await owncoding.boundingBox()
    expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(avisoBox.y + 1)
  })
}

for (const [ancho, alto] of [
  [320, 800],
  [360, 800],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1440, 900],
]) {
  test(`aviso: controles y espacio reservado en ${ancho}px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await preparar(page)
    await page.goto('/landing-preview', { waitUntil: 'domcontentloaded' })
    const aviso = page.getByTestId('aviso-metricas')
    await expect(aviso).toBeVisible()
    const link = await aviso.getByRole('link', { name: 'Más info' }).boundingBox()
    const cerrar = await aviso.getByRole('button', { name: 'Cerrar aviso' }).boundingBox()
    const banner = await aviso.boundingBox()
    expect(link.width).toBeGreaterThanOrEqual(44)
    expect(link.height).toBeGreaterThanOrEqual(44)
    expect(cerrar.width).toBeGreaterThanOrEqual(44)
    expect(cerrar.height).toBeGreaterThanOrEqual(44)
    expect(link.x + link.width <= cerrar.x || cerrar.x + cerrar.width <= link.x).toBe(true)
    expect(
      await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom)),
    ).toBeGreaterThanOrEqual(banner.height - 1)
    await sinScrollHorizontal(page)
  })
}

test('aviso en la demo (modo oscuro) y no aparece con No rastrear', async ({ page }) => {
  await preparar(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('aviso-metricas')).toBeVisible()
  await page.evaluate(() => localStorage.clear())
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }),
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Entrar como Dueño', exact: true })).toBeVisible()
  await expect(page.getByTestId('aviso-metricas')).toHaveCount(0)
})

test('«No medir» en /privacidad frena los envíos y se recuerda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const envios = await preparar(page)
  // Con medición activa, la landing envía su vista.
  await page.goto('/landing-preview', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => envios.length).toBeGreaterThan(0)
  const antes = envios.length

  await page.goto('/privacidad', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Cuánto se guarda' })).toBeVisible()
  await expect(page.getByText('90 días')).toBeVisible()
  const interruptor = page.getByRole('switch', { name: 'No medir' })
  await expect(interruptor).toHaveAttribute('aria-checked', 'false')
  expect((await interruptor.boundingBox()).height).toBeGreaterThanOrEqual(43.5)
  await sinScrollHorizontal(page)
  await interruptor.click()
  await expect(interruptor).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => localStorage.getItem('mobos:no-medir'))).toBe('1')
  expect(await page.evaluate(() => localStorage.getItem('mobos:vid'))).toBeNull()

  // Recargas posteriores no envían nada ni muestran el aviso.
  const tras = envios.length
  await page.goto('/landing-preview', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.waitForTimeout(1500)
  expect(envios.length).toBe(tras)
  expect(tras).toBeGreaterThanOrEqual(antes)
  await expect(page.getByTestId('aviso-metricas')).toHaveCount(0)
})
