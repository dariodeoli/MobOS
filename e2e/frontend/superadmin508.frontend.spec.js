import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

async function montar(page, acceso = true) {
  const llamadas = []
  await page.route(/^https:\/\//, route => route.abort())
  await page.route('**/api/**', route => {
    const req = route.request(), url = new URL(req.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    llamadas.push({ method: req.method(), path: url.pathname, search: url.search })
    if (url.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: {} })
    if (url.pathname === '/api/superadmin/access') return route.fulfill({ status: acceso ? 200 : 404, json: acceso ? { ok: true } : {} })
    if (url.pathname === '/api/superadmin/resumen') return route.fulfill({ json: { kpis: [], demo: { empresas: 0, usuarios: 0, pedidos: 0 }, sinDatos: true } })
    if (url.pathname === '/api/superadmin/empresas') return route.fulfill({ json: { items: [], total: 0, pagina: 1, porPagina: 30 } })
    return route.fulfill({ json: { ok: true } })
  })
  await page.addInitScript(() => { localStorage.setItem('mobos:theme', 'light'); localStorage.setItem('mobos:aviso-metricas', '1'); localStorage.setItem('mobos:shell:menu-plegado', 'true') })
  return llamadas
}

test('plegado propio conserva navegación operativa, período y autoridad del servidor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await montar(page)
  await page.goto('/superadmin?p=7')
  const lateral = page.getByTestId('plataforma-lateral')
  await expect(lateral).toBeVisible()
  await expect(page.getByTestId('plataforma-barra-titulo')).toContainText('Centro de control')
  await expect(page.getByTestId('periodo-7')).toHaveAttribute('aria-pressed', 'true')
  const ancho = (await lateral.boundingBox()).width
  await page.getByRole('button', { name: 'Plegar navegación de plataforma', exact: true }).click()
  await expect(lateral).toHaveAttribute('data-compacto', 'true')
  expect((await lateral.boundingBox()).width).toBeLessThan(ancho)
  if (process.env.MOBOS_QA_OUT) { await mkdir(process.env.MOBOS_QA_OUT, { recursive: true }); await page.screenshot({ path: `${process.env.MOBOS_QA_OUT}/plataforma-plegada.png` }) }
  await expect(lateral.getByRole('link', { name: 'Empresas', exact: true })).toBeVisible()
  await lateral.getByRole('link', { name: 'Empresas', exact: true }).click()
  await expect(page).toHaveURL(/\/superadmin\/empresas\?p=7$/)
  await page.reload()
  await expect(lateral).toHaveAttribute('data-compacto', 'true')
  expect(await page.evaluate(() => localStorage.getItem('mobos:shell:menu-plegado'))).toBe('true')
  await page.getByRole('button', { name: 'Expandir navegación de plataforma', exact: true }).click()
  await expect(page.getByTestId('plataforma-identidad')).toContainText('Vista global')
  expect((await page.getByTestId('plataforma-identidad').boundingBox()).y).toBeGreaterThan(600)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const width of [320, 390]) test(`salida efectiva y controles alcanzables a ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  const llamadas = await montar(page)
  await page.goto('/superadmin')
  const salir = page.getByRole('button', { name: 'Cerrar sesión', exact: true })
  await expect(salir).toBeVisible()
  const box = await salir.boundingBox()
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await salir.click()
  await expect(page).toHaveURL(/\/login$/)
  expect(llamadas.filter(x => x.method === 'POST' && x.path === '/api/auth/logout')).toHaveLength(1)
  await expect(page.getByTestId('superadmin-shell')).toHaveCount(0)
})

test('sin acceso no monta identidad ni navegación de plataforma', async ({ page }) => {
  const llamadas = await montar(page, false)
  await page.goto('/superadmin')
  await expect(page).not.toHaveURL(/\/superadmin/)
  await expect(page.getByTestId('superadmin-shell')).toHaveCount(0)
  expect(llamadas.some(x => x.path === '/api/superadmin/resumen')).toBe(false)
})
