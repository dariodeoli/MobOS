// Verificación en PRODUCCIÓN (post-.140) del contraste AA del POS (#176) y de
// las vistas del shell (#180), sobre el demo anónimo. Temporal.
import { test, expect } from '@playwright/test'

const SHOTS = '/tmp/mobos-qa-dsn'
const APP = 'https://app.moboss.online'
const PALETA_NUEVA = '4 120 87' // --c-fono-light del tema claro con AA (#176, .140)
const tema = (page, modo) => page.addInitScript((m) => { try { localStorage.setItem('mobos:theme', m) } catch {} }, modo)
const captura = (page, nombre) => page.screenshot({ path: `${SHOTS}/cprod-${nombre}.png`, fullPage: true })

async function entrarDemoDueno(page) {
  await page.goto(`${APP}/demo`)
  await page.getByRole('button', { name: /Entrar como Dueño/i }).click()
  await expect(page.getByTestId('menu-acciones')).toBeVisible({ timeout: 30_000 })
  const guia = page.getByRole('dialog', { name: 'Cómo funciona la demo' })
  if (await guia.count()) await guia.getByRole('button', { name: 'Cerrar' }).click().catch(() => {})
}

async function contraste(page) {
  return page.evaluate(() => {
    const parse = (color) => { const m = String(color).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); return m ? { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alfa: m[4] === undefined ? 1 : Number(m[4]) } : null }
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05) }
    const fondoDe = (el) => { let nodo = el; while (nodo) { const c = parse(getComputedStyle(nodo).backgroundColor); if (c && c.alfa > 0.6) return c.rgb; nodo = nodo.parentElement } return [255, 255, 255] }
    const textos = Array.from(document.querySelectorAll('main p, main span, main b, main strong, main label, main h1, main h2, main h3, main li, main dt, main dd'))
      .filter((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 1 && el.children.length === 0)
    const bajos = []
    for (const el of textos) {
      const cs = getComputedStyle(el)
      const color = parse(cs.color)
      if (!color) continue
      const tamano = parseFloat(cs.fontSize)
      const grande = tamano >= 24 || (tamano >= 18.66 && Number(cs.fontWeight) >= 600)
      const r = ratio(color.rgb, fondoDe(el))
      if (r < (grande ? 3 : 4.5)) bajos.push({ texto: (el.textContent || '').trim().slice(0, 30), ratio: Number(r.toFixed(2)) })
    }
    return { medidos: textos.length, totalBajos: bajos.length, bajos: bajos.slice(0, 6) }
  })
}

test('producción: paleta AA en el POS (claro/oscuro) y vistas del shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemoDueno(page)
  const token = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--c-fono-light').trim())
  console.log(`[prod-paleta] --c-fono-light = "${token}" · esperada post-.140: "${PALETA_NUEVA}"`)

  for (const modo of ['light', 'dark']) {
    await tema(page, modo)
    await page.goto(`${APP}/pos`)
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible({ timeout: 25_000 })
    const buscador = page.getByPlaceholder('Buscar producto…')
    await buscador.fill('iPhone')
    const producto = page.getByRole('button', { name: /iPhone|Equipo/i }).first()
    if (await producto.count()) await producto.click()
    const medida = await contraste(page)
    console.log(`[prod-${modo}] medidos=${medida.medidos} bajos=${medida.totalBajos} ${JSON.stringify(medida.bajos)}`)
    if (modo === 'dark') expect(medida.totalBajos, `contraste oscuro: ${JSON.stringify(medida.bajos)}`).toBe(0)
    if (token === PALETA_NUEVA) expect(medida.totalBajos, `contraste claro post-.140: ${JSON.stringify(medida.bajos)}`).toBe(0)
    await captura(page, `pos-${modo}`)
  }

  // #180: lista de precios y comparador dentro del shell.
  for (const [ruta, titulo, archivo] of [['/celulares', 'Lista de precios', 'lista-de-precios'], ['/comparador', 'Comparador', 'comparador']]) {
    await page.goto(`${APP}${ruta}`)
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(0)
    console.log(`[prod-shell] ${ruta} dentro del shell ✓`)
    await captura(page, `shell-${archivo}`)
  }
})
