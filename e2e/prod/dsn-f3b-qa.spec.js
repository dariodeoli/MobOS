import { test, expect } from '@playwright/test'
const SHOTS = '/tmp/mobos-qa-dsn'
const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch {} }, modo)

async function contraste(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) } : null }
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05) }
    const fondo = (el) => { let n = el; while (n) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0.6) return c.rgb; n = n.parentElement } return [255, 255, 255] }
    const textos = Array.from(document.querySelectorAll('p, span, b, strong, label, h1, h2, h3, li, dt, dd, button'))
      .filter((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 1 && el.children.length === 0)
      .filter((el) => { const c = el.closest('button, input, select, textarea'); return !(c && (c.disabled || c.getAttribute('aria-disabled') === 'true')) })
    const bajos = []
    for (const el of textos) {
      const cs = getComputedStyle(el); const color = parse(cs.color)
      if (!color) continue
      const tam = parseFloat(cs.fontSize); const grande = tam >= 24 || (tam >= 18.66 && Number(cs.fontWeight) >= 600)
      const r = ratio(color.rgb, fondo(el))
      if (r < (grande ? 3 : 4.5)) bajos.push({ texto: (el.textContent || '').trim().slice(0, 28), ratio: Number(r.toFixed(2)), color: cs.color })
    }
    return { medidos: textos.length, totalBajos: bajos.length, bajos: bajos.slice(0, 6) }
  })
}

test('F3: mock + contraste de los tokens v2', async ({ page }) => {
  for (const [vista, ancho] of [['mobile', 390], ['desktop', 1280]]) {
    await page.setViewportSize({ width: ancho, height: 1000 })
    for (const modo of ['light', 'dark']) {
      await tema(page, modo)
      await page.goto('/rediseno-f3')
      await expect(page.getByText(/propuesta F3/)).toBeVisible({ timeout: 30_000 })
      const m = await contraste(page)
      console.log(`[f3-${vista}-${modo}] medidos=${m.medidos} bajos=${m.totalBajos} ${JSON.stringify(m.bajos)}`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
      await page.screenshot({ path: `${SHOTS}/c241f3-${vista}-${modo}.png`, fullPage: true })
    }
  }
  // Contraste del v2 en las pantallas piloto (ficha + carrito).
  for (const modo of ['light', 'dark']) {
    await tema(page, modo)
    await page.goto('/inventario/unidades')
    const fila = page.getByTestId('inventario-fila').first()
    await expect(fila).toBeVisible({ timeout: 30_000 })
    const inv = await contraste(page)
    console.log(`[v2-inventario-${modo}] medidos=${inv.medidos} bajos=${inv.totalBajos} ${JSON.stringify(inv.bajos)}`)
    await fila.click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    const ficha = await contraste(page)
    console.log(`[v2-ficha-${modo}] medidos=${ficha.medidos} bajos=${ficha.totalBajos} ${JSON.stringify(ficha.bajos)}`)
    await page.keyboard.press('Escape')
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible({ timeout: 30_000 })
    const carrito = await contraste(page)
    console.log(`[v2-carrito-${modo}] medidos=${carrito.medidos} bajos=${carrito.totalBajos} ${JSON.stringify(carrito.bajos)}`)
  }
})
