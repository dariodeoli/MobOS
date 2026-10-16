import { test, expect } from '@playwright/test'
import { measureLayout } from './helpers/layoutContract.js'

async function aislar(page, dark) {
  await page.route('**/api/**', r => new URL(r.request().url()).pathname.startsWith('/api/') ? r.fulfill({ status: 503, json: { error: 'QA demo aislada' } }) : r.continue())
  await page.route(/https:\/\//, r => r.abort())
  await page.addInitScript(dark => {
    sessionStorage.setItem('mobos:demo-guia-vista', '1')
    localStorage.setItem('mobos:theme', dark ? 'dark' : 'light')
  }, dark)
}
async function textosPequenos(root, minimo) {
  return root.evaluate((root, minimo) => {
    const encontrados = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!n.textContent.trim() || !el.getClientRects().length || el.closest('svg, [aria-hidden="true"], .sr-only')) continue
      const style = getComputedStyle(el), size = parseFloat(style.fontSize)
      if (style.visibility === 'hidden' || size >= minimo) continue
      encontrados.push({ texto: n.textContent.trim().slice(0, 70), size })
    }
    return encontrados
  }, minimo)
}
for (const width of [360, 390, 1440]) for (const dark of [false, true]) {
  test(`#396 tipografía landing ${width} ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await aislar(page, dark)
    await page.goto('/landing-preview')
    const root = page.locator('.mobos-commercial-landing')
    await expect(root).toBeVisible()
    expect(await page.locator('html').evaluate(el => el.classList.contains('dark'))).toBe(dark)
    expect(await textosPequenos(root, 11), 'mínimo11px incluso en texto decorativo').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  })
}
for (const width of [360, 390, 1440]) for (const dark of [false, true]) test(`#396 contraste PIN Atajos Dirección ${width} ${dark ? 'oscuro' : 'claro'}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await aislar(page, dark)
  await page.goto('/demo')
  await expect(page.getByRole('button', { name: 'Entrar como Dueño', exact: true })).toBeVisible()
  let medidas = await measureLayout(page)
  expect(medidas.lowContrast.filter(x => /2001|3001|PIN/.test(x.what))).toEqual([])
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
  const nav = width < 1024 ? page.getByTestId('shell-bottom-nav') : page.getByTestId('shell-lateral').getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav.getByRole('button', { name: 'Vender', exact: true }).click()
  if (width < 1024) await page.getByRole('button', { name: /Agregar cliente/ }).click()
  const cliente = page.getByTestId(width < 1024 ? 'hoja-cliente' : 'pos-bloque-cliente')
  await cliente.getByText('Datos de contacto, RUC/CI y direcciones').click()
  await expect(cliente.getByRole('button', { name: '+ Dirección', exact: true })).toBeVisible()
  if (width >= 1024) await expect(page.getByText('Atajos', { exact: true })).toBeVisible()
  medidas = await measureLayout(page)
  expect(medidas.lowContrast.filter(x => /Atajos|F2|Ctrl\+S|Esc|Dirección/.test(x.what))).toEqual([])
  if (width >= 1024) {
    const atajos = page.getByText('Atajos', { exact: true }).locator('..')
    expect(await textosPequenos(atajos, 12), 'atajos legibles sin opacidad reducida').toEqual([])
    expect(await atajos.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
})
