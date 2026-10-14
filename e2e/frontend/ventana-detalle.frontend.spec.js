import { test, expect } from '@playwright/test'
import { openShellDestination } from '../helpers/shell-navigation.js'

// #386: los detalles y vistas previas abren una ventana centrada (no un panel
// pegado a la derecha) con X roja de 44 px; en celular ocupa la pantalla.
// Demo frontend-only (sin backend).
async function abrirVistaRapida(page, width, height) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.setViewportSize({ width, height })
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  await openShellDestination(page, 'Pedidos')
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  const quick = page.getByTestId('pedido-fila').first().getByRole('button', { name: /Vista rápida/ })
  await quick.click()
  const dialog = page.getByRole('dialog')
  await expect(page.getByTestId('pedido-vista-rapida')).toBeVisible()
  return { dialog, quick }
}

async function medirCierre(dialog) {
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true })
  const box = await close.boundingBox()
  const color = await close.evaluate(el => getComputedStyle(el).backgroundColor)
  return { box, color }
}

test.describe('ventana de detalle centrada (#386)', () => {
  test('1440: centrada, con X roja de al menos 44 px', async ({ page }) => {
    const { dialog } = await abrirVistaRapida(page, 1440, 900)
    const box = await dialog.boundingBox()
    expect(Math.abs(box.x + box.width / 2 - 720), 'centrada en horizontal').toBeLessThanOrEqual(12)
    expect(Math.abs(box.y + box.height / 2 - 450), 'centrada en vertical').toBeLessThanOrEqual(12)
    expect(box.x, 'no está pegada a la derecha').toBeGreaterThan(200)
    expect(box.height).toBeLessThanOrEqual(900 * 0.9 + 1)
    const { box: x, color } = await medirCierre(dialog)
    expect(x.width).toBeGreaterThanOrEqual(44)
    expect(x.height).toBeGreaterThanOrEqual(44)
    const [r, g, b] = color.match(/\d+/g).map(Number)
    expect(r, 'X roja').toBeGreaterThan(g + 60)
    expect(r).toBeGreaterThan(b + 60)
  })

  test('390: ocupa la pantalla, sin scroll horizontal y la X siempre visible', async ({ page }) => {
    const { dialog } = await abrirVistaRapida(page, 390, 844)
    const box = await dialog.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(390 - 24 - 1)
    expect(box.height).toBeGreaterThanOrEqual(844 - 24 - 1)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    const { box: x } = await medirCierre(dialog)
    expect(x.width).toBeGreaterThanOrEqual(44)
    expect(x.height).toBeGreaterThanOrEqual(44)
    expect(x.x + x.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Esc y clic afuera cierran y el foco vuelve al disparador', async ({ page }) => {
    const { dialog, quick } = await abrirVistaRapida(page, 1440, 900)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(quick).toBeFocused()
    await quick.click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(8, 450)
    await expect(dialog).toHaveCount(0)
  })
})
