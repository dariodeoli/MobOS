// #328 · Acceso a la demo: perfiles en cápsulas compactas y pantalla sin scroll
// en móvil (390×844). La evidencia reproducible vive en docs/qa/328-demo-acceso/
// (scripts/qa-328-capturas.mjs); acá queda el gate de regresión.
import { test, expect } from '@playwright/test'

const VIEWPORT = { width: 390, height: 844 }

for (const tema of ['light', 'dark']) {
  test(`#328 · /demo entra sin scroll en móvil con cápsulas ≥44px (${tema})`, async ({ page }) => {
    await page.addInitScript((valor) => {
      try { localStorage.setItem('mobos:theme', valor) } catch { /* sin storage */ }
    }, tema)
    await page.setViewportSize(VIEWPORT)
    await page.goto('/demo')
    // #235: el PIN está siempre visible sin desplegar nada.
    await expect(page.locator('#demo-pin')).toBeVisible()

    // Las seis cápsulas conservan el nombre accesible «Entrar como <Rol>»
    // (contrato de los specs del demo) y un target táctil de 44px (#249).
    const capsulas = page.getByRole('button', { name: /^Entrar como / })
    await expect(capsulas).toHaveCount(6)
    for (const capsula of await capsulas.all()) {
      const caja = await capsula.boundingBox()
      expect(caja.width).toBeGreaterThanOrEqual(44)
      expect(caja.height).toBeGreaterThanOrEqual(44)
    }

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

    // Descripciones cortas visibles (contrato de la suite #235).
    await expect(page.getByText('Ventas y clientes.')).toBeVisible()
    await expect(page.getByText('Operación completa.')).toBeVisible()
  })
}
