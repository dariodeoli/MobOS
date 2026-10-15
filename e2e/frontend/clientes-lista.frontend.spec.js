import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Lista de Clientes: vacío bajo el encabezado, tarjeta sin filtros, barra de
// una fila a 1440 y sin scroll horizontal a 390 (docs/TABLAS.md).
const salida = process.env.MOBOS_QA_OUT_CLIENTES || '/tmp/mobos-clientes-lista'

const cliente = (index) => ({
  id: `qa-cliente-${index}`,
  name: `Cliente QA ${index}`,
  phone: '0981123456',
  countryCode: '+595',
  pricingTier: 'RETAIL',
  stats: { orders: 2, totalSpentPyg: 1000, pendingPyg: index === 0 ? 250000 : 0, lastOrderAt: '2026-10-10T12:00:00Z' },
})

async function mock(page, { vacio = false } = {}) {
  await page.route(/https:\/\//, (route) => route.abort())
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    let body = []
    if (path === '/api/auth/me') body = { user: { id: 'qa-user', name: 'Usuario local', role: 'ADMIN', tenantId: 'qa-tenant', branchId: 'qa-branch', branchName: 'Sucursal local' }, tenant: { id: 'qa-tenant', name: 'Tienda local' } }
    if (path === '/api/inventory/branches') body = [{ id: 'qa-branch', name: 'Sucursal local' }]
    if (path === '/api/customers/summary') body = { total: vacio ? 0 : 2, wholesalers: 0, retail: vacio ? 0 : 2 }
    if (path === '/api/customers' && route.request().method() === 'GET') {
      const filtrado = url.searchParams.has('q') || url.searchParams.has('filtro')
      body = vacio || filtrado ? [] : [cliente(0), cliente(1)]
    }
    if (path === '/api/customers/duplicates') body = { duplicados: [] }
    if (path === '/api/customers/segments') body = { rows: [], total: 0 }
    return route.fulfill({ status: 200, json: body })
  })
  await page.addInitScript(() => localStorage.setItem('mobos:clientes-vista', 'list'))
}

const sinScrollHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const ancho of [390, 1440]) {
  test(`Clientes vacío sin filtros: tarjeta con «Crear cliente» y sin encabezado a ${ancho}px`, async ({ page }) => {
    await mkdir(salida, { recursive: true })
    await page.setViewportSize({ width: ancho, height: 900 })
    await mock(page, { vacio: true })
    await page.goto('/clientes')
    const root = page.locator('.clientes-f3')
    const vacio = root.getByTestId('clientes-vacio')
    await expect(vacio).toBeVisible()
    await expect(vacio.getByRole('button', { name: /Crear cliente/ })).toBeVisible()
    await expect(root.getByTestId('clientes-tabla')).toHaveCount(0)
    await expect(root.getByText('No hay resultados.')).toHaveCount(0)
    expect(await sinScrollHorizontal(page)).toBe(true)
    await page.screenshot({ path: `${salida}/vacio-${ancho}.png` })
  })

  test(`Clientes sin coincidencias: el aviso va debajo del encabezado a ${ancho}px`, async ({ page }) => {
    await mkdir(salida, { recursive: true })
    await page.setViewportSize({ width: ancho, height: 900 })
    await mock(page)
    await page.goto('/clientes')
    const root = page.locator('.clientes-f3')
    await expect(root.getByTestId('cliente-fila').first()).toBeVisible()
    await root.getByRole('textbox', { name: 'Buscar clientes' }).fill('zzzz')
    const aviso = root.getByTestId('clientes-sin-coincidencias')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('Ningún cliente coincide')
    const tabla = await root.getByTestId('clientes-tabla').boundingBox()
    const avisoCaja = await aviso.boundingBox()
    // El aviso vive dentro de la tabla/tarjetas, debajo del encabezado, nunca encima.
    expect(avisoCaja.y).toBeGreaterThan(tabla.y)
    if (ancho >= 1200) {
      const cabecera = await root.getByRole('button', { name: /Ordenar total gastado/i }).boundingBox()
      expect(cabecera.y).toBeLessThan(avisoCaja.y)
    }
    await expect(root.getByTestId('clientes-vacio')).toHaveCount(0)
    expect(await sinScrollHorizontal(page)).toBe(true)
    await page.screenshot({ path: `${salida}/sin-coincidencias-${ancho}.png` })
    await aviso.getByRole('button', { name: 'Limpiar filtros' }).click()
    await expect(root.getByTestId('cliente-fila').first()).toBeVisible()
  })
}

for (const ancho of [768, 1024, 1280, 1440]) test(`Clientes a ${ancho}: barra en una sola fila y KPIs en una línea sin subtexto`, async ({ page }) => {
  await page.setViewportSize({ width: ancho, height: 900 })
  await mock(page)
  await page.goto('/clientes')
  const root = page.locator('.clientes-f3')
  await expect(root.getByTestId('cliente-fila').first()).toBeVisible()
  const barra = root.getByTestId('barra-clientes')
  const cajas = await barra.evaluate((nodo) => {
    const objetivos = [...nodo.querySelectorAll('input, select, button, [data-slot="actions"] > *')].filter((el) => el.offsetParent !== null)
    return objetivos.map((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
  })
  const arriba = Math.min(...cajas.map((c) => c.top))
  const abajo = Math.max(...cajas.map((c) => c.bottom))
  await mkdir(salida, { recursive: true })
  await page.screenshot({ path: `${salida}/lista-${ancho}.png` })
  // Con el menú lateral abierto, desde 1440 px la barra cabe en UNA fila; debajo
  // envuelve limpio en dos (nunca desborda ni esconde «Crear cliente»).
  if (ancho >= 1440) expect(abajo - arriba).toBeLessThanOrEqual(60)
  await expect(barra.getByRole('button', { name: /Crear cliente/ })).toBeVisible()
  const resumen = root.getByTestId('resumen-clientes')
  await expect(resumen).not.toContainText('En pantalla')
  await expect(resumen).not.toContainText('Tienda')
  expect((await resumen.boundingBox()).height).toBeLessThanOrEqual(64)
  expect(await sinScrollHorizontal(page)).toBe(true)
  await mkdir(salida, { recursive: true })
  await page.screenshot({ path: `${salida}/lista-${ancho}.png` })
})

test('Clientes a 390: buscador a ancho completo, acción primaria alcanzable y KPIs en una línea', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mock(page)
  await page.goto('/clientes')
  const root = page.locator('.clientes-f3')
  await expect(root.getByTestId('cliente-fila').first()).toBeVisible()
  const barra = root.getByTestId('barra-clientes')
  const crear = barra.getByRole('button', { name: /Crear cliente/ })
  await expect(crear).toBeVisible()
  expect((await crear.boundingBox()).height).toBeGreaterThanOrEqual(44)
  expect((await root.getByTestId('resumen-clientes').boundingBox()).height).toBeLessThanOrEqual(64)
  expect(await sinScrollHorizontal(page)).toBe(true)
  await mkdir(salida, { recursive: true })
  await page.screenshot({ path: `${salida}/lista-390.png` })
})
