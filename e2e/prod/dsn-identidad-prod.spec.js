// Recorrido de PRODUCCIÓN de la identidad unificada (#211) en el demo anónimo
// y de la landing (#202). Temporal, no se commitea.
import { test, expect } from '@playwright/test'

const SHOTS = '/tmp/mobos-qa-dsn'
const APP = process.env.MOBOS_QA_APP || 'https://app.moboss.online'

async function cerrarGuiaDemo(page) {
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) {
    await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
    await expect(guia).toHaveCount(0, { timeout: 5_000 }).catch(() => {})
  }
}

async function entrarDemoDueno(page) {
  await page.goto(`${APP}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await expect(page.getByTestId('menu-acciones')).toBeVisible({ timeout: 30_000 })
  await cerrarGuiaDemo(page)
}

async function abrirPrimerPedido(page) {
  await page.goto(`${APP}/pedidos`)
  const fila = page.getByTestId('pedido-fila').first()
  await expect(fila).toBeVisible({ timeout: 25_000 })
  await fila.click()
  await expect(page.getByText('Artículos preparados')).toBeVisible({ timeout: 25_000 })
}

const estadoIdentidad = async (page) => page.evaluate(() => {
  const imagenes = Array.from(document.images)
  return {
    chips: document.querySelectorAll('[data-testid="persona-chip"]').length,
    imagenes: imagenes.length,
    rotas: imagenes.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.alt || img.src),
    avatares: imagenes.filter((img) => /^Foto de/.test(img.alt)).length,
  }
})

test('producción: identidad en el pedido (demo) claro/oscuro', async ({ page }) => {
  const errores = []
  page.on('pageerror', (error) => errores.push(error.message))
  await entrarDemoDueno(page)
  await abrirPrimerPedido(page)
  const claro = await estadoIdentidad(page)
  console.log(`[prod-pedido-claro] ${JSON.stringify(claro)}`)
  await page.screenshot({ path: `${SHOTS}/c211-prod-pedido-claro.png`, fullPage: true })
  await page.getByRole('main').getByRole('button', { name: /^Cronología/ }).click()
  await page.screenshot({ path: `${SHOTS}/c211-prod-cronologia-claro.png`, fullPage: true })

  // Oscuro: misma pantalla.
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch {} })
  await page.reload()
  await expect(page.getByText('Artículos preparados')).toBeVisible({ timeout: 25_000 })
  await page.getByRole('main').getByRole('button', { name: /^Cronología/ }).click()
  const oscuro = await estadoIdentidad(page)
  console.log(`[prod-pedido-oscuro] ${JSON.stringify(oscuro)}`)
  await page.screenshot({ path: `${SHOTS}/c211-prod-pedido-oscuro.png`, fullPage: true })

  expect(claro.rotas.length + oscuro.rotas.length, `imágenes rotas: ${JSON.stringify([...claro.rotas, ...oscuro.rotas])}`).toBe(0)
  expect(errores, `errores: ${errores.join(' | ')}`).toEqual([])
})

test('producción: pantalla de bloqueo (demo) claro/oscuro', async ({ page }) => {
  await entrarDemoDueno(page)
  const bloquear = async () => {
    await page.getByTestId('menu-acciones').click()
    await page.getByRole('menuitem', { name: 'Bloquear pantalla' }).click()
    await expect(page.getByText(/Ingresá tu PIN/)).toBeVisible({ timeout: 15_000 })
  }
  await bloquear()
  const claro = await estadoIdentidad(page)
  console.log(`[prod-bloqueo-claro] ${JSON.stringify(claro)}`)
  await page.screenshot({ path: `${SHOTS}/c211-prod-bloqueo-claro.png` })

  // Oscuro: el bloqueo persiste tras recargar (es un overlay del shell), así
  // que alcanza con cambiar el tema y recargar; si no persistiera, se bloquea.
  await page.addInitScript(() => { try { localStorage.setItem('mobos:theme', 'dark') } catch {} })
  await page.reload()
  if (await page.getByText(/Ingresá tu PIN/).count() === 0) {
    await expect(page.getByTestId('menu-acciones')).toBeVisible({ timeout: 25_000 })
    await cerrarGuiaDemo(page)
    await bloquear()
  }
  const oscuro = await estadoIdentidad(page)
  console.log(`[prod-bloqueo-oscuro] ${JSON.stringify(oscuro)}`)
  await page.screenshot({ path: `${SHOTS}/c211-prod-bloqueo-oscuro.png` })
  expect(claro.rotas.length + oscuro.rotas.length, 'sin imágenes rotas').toBe(0)
})
