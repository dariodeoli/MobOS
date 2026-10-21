// #328 · Acceso a la demo: perfiles en cápsulas compactas y pantalla sin scroll
// en móvil (390×844). La evidencia reproducible vive en docs/qa/328-demo-acceso/
// (scripts/qa-328-capturas.mjs); acá queda el gate de regresión.
import { test, expect } from '@playwright/test'
import { esperarAnimaciones } from './helpers/animaciones.js'

const VIEWPORT = { width: 390, height: 844 }

for (const tema of ['light', 'dark']) {
  test(`#328 · /demo entra sin scroll en móvil con cápsulas ≥44px (${tema})`, async ({ page }) => {
    await page.addInitScript((valor) => {
      try { localStorage.setItem('mobos:theme', valor) } catch { /* sin storage */ }
    }, tema)
    await page.setViewportSize(VIEWPORT)
    await page.goto('/demo')
    await esperarAnimaciones(page)
    // La entrada ofrece SOLO Dueño y Vendedor, con el nombre accesible
    // «Entrar como <Rol>» (contrato de los specs del demo) y tarjetas grandes.
    const capsulas = page.getByRole('button', { name: /^Entrar como / })
    await expect(capsulas).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Entrar como Dueño' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Entrar como Vendedor' })).toBeVisible()
    for (const capsula of await capsulas.all()) {
      const caja = await capsula.boundingBox()
      expect(caja.width).toBeGreaterThanOrEqual(44)
      expect(caja.height).toBeGreaterThanOrEqual(64)
    }
    // El teclado de PIN queda plegado debajo y el disparador es táctil (44px).
    await expect(page.locator('#demo-pin')).toBeHidden()
    const toggle = page.getByTestId('demo-pin-toggle')
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44)

    // El pedido del issue: todo (cápsulas, PIN, notas y pie) entra sin scroll.
    const medidas = await page.evaluate(() => {
      const raiz = document.scrollingElement || document.documentElement
      return {
        scrollHeight: raiz.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: raiz.scrollWidth,
        innerWidth: window.innerWidth,
      }
    })
    expect(medidas.scrollHeight).toBeLessThanOrEqual(medidas.innerHeight)
    expect(medidas.scrollWidth).toBeLessThanOrEqual(medidas.innerWidth)
    await expect(page.getByTestId('demo-perfiles')).toBeVisible()
    await expect(page.getByText('Ventas y clientes.')).toBeVisible()
  })
}

test('#328 · el teclado de PIN se despliega y sigue accesible a 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/demo')
  const toggle = page.getByTestId('demo-pin-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await esperarAnimaciones(page)
  await expect(page.locator('#demo-pin')).toBeVisible()
  const teclas = page.getByRole('button', { name: /^Dígito \d$/ })
  expect(await teclas.count()).toBe(10)
  for (const tecla of await teclas.all()) {
    const caja = await tecla.boundingBox()
    expect(caja.width).toBeGreaterThanOrEqual(44)
    expect(caja.height).toBeGreaterThanOrEqual(44)
  }
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  expect(ancho).toBe(true)
})
