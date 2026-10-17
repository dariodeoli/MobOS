import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openShellDestination, selectAnalysisSection } from '../helpers/shell-navigation.js'

// #451: la demo completa (120 días, accesorios, medios de pago) y Reportes sin
// superposiciones, incluidos los bordes de sus cambios de columnas.
const out = process.env.MOBOS_QA_OUT || '/tmp/mobos-demo-pro-qa'
const WIDTHS = [
  [320, 800],
  [390, 844],
  [479, 844],
  [480, 844],
  [768, 900],
  [1099, 900],
  [1100, 900],
  [1280, 900],
  [1440, 900],
]

async function enterDemo(page) {
  await page.route('**/api/**', route =>
    !new URL(route.request().url()).pathname.startsWith('/api/')
      ? route.continue()
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Frontend-only harness"}' }),
  )
  await page.route(/https:\/\//, route => route.abort())
  await page.addInitScript(() => sessionStorage.setItem('mobos:demo-guia-vista', '1'))
  await page.goto('/demo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Entrar como Dueño', exact: true }).click()
  await expect(page.getByTestId('shell')).toBeVisible()
}

async function settle(page) {
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0)
  await expect(page.locator('main').first()).toContainText(/\S/)
  await page.waitForTimeout(700)
}

const cajas = async (page, selector) =>
  page.locator(selector).evaluateAll(nodos => nodos.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom } }))

const seSuperponen = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1

for (const [width, height] of WIDTHS) {
  for (const dark of [false, true]) {
    if (dark && width === 1440) continue
    test(`Reportes sin superposiciones ${width}px ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await enterDemo(page)
      if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'))
      await openShellDestination(page, 'Análisis')
      await selectAnalysisSection(page, 'Reportes')
      await settle(page)

      // Tira de KPIs: cada celda en su casilla, sin cruces ni texto desbordado.
      await expect(page.getByTestId('reportes-kpis')).toBeVisible()
      const celdas = await cajas(page, '[data-testid="reportes-kpis"] > div')
      expect(celdas.length).toBe(4)
      for (let i = 0; i < celdas.length; i += 1) for (let j = i + 1; j < celdas.length; j += 1) expect(seSuperponen(celdas[i], celdas[j]), `KPI ${i} y ${j} se pisan`).toBe(false)
      const desborde = await page.evaluate(() => [...document.querySelectorAll('[data-testid="reportes-kpis"] > div, [data-testid="reportes-metricas"] > div:first-of-type > div')]
        .filter(n => n.scrollWidth > n.clientWidth + 1).length)
      expect(desborde, 'texto desbordado en las celdas').toBe(0)

      // «Métricas y evolución»: contenedor con tarjetas y gráficos con datos de 30 días.
      const metricas = page.getByTestId('reportes-metricas')
      await expect(metricas).toBeVisible()
      await expect(metricas.getByRole('heading', { name: 'Métricas y evolución' })).toBeVisible()
      await expect(metricas.getByText('Rotación del período')).toBeVisible()
      await expect(page.getByTestId('reportes-grafico-dias')).toBeVisible()
      await expect(page.getByTestId('reportes-grafico-grupos')).toBeVisible()
      const tarjetas = await cajas(page, '[data-testid="reportes-metricas"] > div:first-of-type > div')
      expect(tarjetas.length).toBe(3)
      for (let i = 0; i < tarjetas.length; i += 1) for (let j = i + 1; j < tarjetas.length; j += 1) expect(seSuperponen(tarjetas[i], tarjetas[j])).toBe(false)
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(sobra, 'scroll horizontal').toBeLessThanOrEqual(0)

      // El gráfico de 30 días tiene ventas repartidas (no queda en 0 hasta hace una semana).
      await expect(page.getByTestId('reportes-grafico-dias').locator('[role="img"]')).toHaveAttribute('aria-label', /Ventas por día/)
      await expect(page.getByTestId('reportes-grafico-dias').getByText(/Período anterior:/)).toBeVisible()
      const filas = page.getByTestId('reportes-grafico-dias').locator('table.sr-only tbody tr')
      const montos = await filas.evaluateAll(nodos => nodos.map(n => (n.lastElementChild?.textContent || '')))
      expect(montos.filter(t => /[1-9]/.test(t)).length).toBeGreaterThanOrEqual(20)

      await mkdir(out, { recursive: true })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${out}/reportes-${width}${dark ? '-dark' : ''}.png`, fullPage: true })
    })
  }
}

test('smoke: cada pantalla principal de la demo tiene contenido', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterDemo(page)
  const pantallas = [
    ['Inicio', /Gs\s?\d/],
    ['Pedidos', /AUR-#?\d{4}/],
    ['Clientes', /González|Pereira|Villalba/],
    ['Taller y garantías', /OS-#\d{4}/],
    ['Productos', /Funda|Cargador|Vidrio|iPhone/],
    ['Compras', /\S{3,}/],
    ['Finanzas', /Gs\s?\d/],
    ['Análisis', /Gs\s?\d/],
  ]
  for (const [nombre, patron] of pantallas) {
    await openShellDestination(page, nombre)
    await settle(page)
    const texto = await page.locator('main').first().innerText()
    expect(texto.length, `${nombre}: contenido`).toBeGreaterThan(200)
    expect(texto, `${nombre}: datos visibles`).toMatch(patron)
  }
})
