// #256 · Composición compacta: POS y Clientes usan la barra de módulo única
// (identidad + contexto + acciones) y el resumen con alcance explícito. Sin
// encabezados duplicados, sin botones aislados y sin desbordes en mobile.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-256-servicio-taller'

// Alta autenticada desde la página (mismo patrón que los specs de #261/#268:
// la sesión va por cookie con `credentials: 'include'`).
async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    return { status: response.status, body: await response.json().catch(() => null) }
  }, { api: SEED.api, path, options })
}

test.describe('composición compacta', () => {
  test('POS: una sola barra de módulo con el título y las acciones', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.getByRole('heading', { name: 'POS', level: 1 }).first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-pos')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByText(/Hoy: \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
    for (const accion of ['Analytics', 'Ventas suspendidas']) {
      await expect(barra.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }
  })

  test('Clientes: resumen con alcance explícito y acciones en la barra', async ({ page }) => {
    await page.goto('/clientes')
    await expect(page.getByTestId('cliente-fila').first()).toBeVisible({ timeout: 20_000 })
    const barra = page.getByTestId('barra-clientes')
    await expect(barra).toHaveCount(1)
    await expect(barra.getByRole('button', { name: '+ Crear cliente' })).toBeVisible()

    const resumen = page.getByTestId('resumen-clientes')
    await expect(resumen).toBeVisible()
    await expect(resumen.locator('> div')).toHaveCount(4)
    // Los totales del negocio y los de la pantalla no se mezclan: cada tile
    // declara su alcance.
    await expect(resumen.getByText('Tienda', { exact: true })).toHaveCount(2)
    await expect(resumen.getByText('En pantalla', { exact: true })).toHaveCount(2)
    await expect(resumen.getByText(/en pantalla$/)).toHaveCount(1)
  })

  test('Servicio/Taller: barra de módulo por vista y resumen con alcance', async ({ page }) => {
    // Una orden de taller para que el resumen tenga datos (el seed comercial no
    // trae órdenes de servicio). La página ya está abierta: el fetch autenticado
    // necesita un origen real (con `about:blank` el navegador manda `Origin: null`).
    await page.goto('/servicio')
    const marca = Date.now().toString(36).toUpperCase()
    const creada = await api(page, '/api/service-orders', { method: 'POST', body: JSON.stringify({ customerName: `Taller ${marca}`, device: `Equipo ${marca}`, pricePyg: 150000, costPyg: 90000 }) })
    expect(creada.status, JSON.stringify(creada.body)).toBe(201)
    await page.reload()

    const barraTaller = page.getByTestId('barra-taller')
    await expect(barraTaller).toHaveCount(1, { timeout: 20_000 })
    for (const accion of ['+ Nueva orden', 'Catálogo', 'Actualizar']) {
      await expect(barraTaller.getByRole('button', { name: accion, exact: true })).toBeVisible()
    }
    const resumenTaller = page.getByTestId('resumen-taller')
    await expect(resumenTaller).toBeVisible()
    await expect(resumenTaller.locator('> div')).toHaveCount(3)
    await expect(resumenTaller.getByText('En pantalla', { exact: true })).toHaveCount(3)
    await page.screenshot({ path: `${SHOTS}/01-taller.png` })

    // La vista Garantías usa la misma composición y sus acciones no quedan
    // sueltas entre los filtros.
    await page.getByRole('button', { name: 'Garantías', exact: true }).click()
    const barraGarantias = page.getByTestId('barra-garantias')
    await expect(barraGarantias).toHaveCount(1)
    await expect(barraGarantias.getByRole('button', { name: 'Nuevo caso' })).toBeVisible()
    await expect(page.getByLabel('Filtrar garantías por estado')).toBeVisible()
    await expect(page.getByLabel('Buscar garantías')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/02-garantias.png` })

    // Sin identidad duplicada: la barra usa h2; el shell conserva el h1 único.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test('sin desborde horizontal en 390 y 1280', async ({ page }) => {
    for (const [ancho, alto] of [[390, 844], [1280, 900]]) {
      await page.setViewportSize({ width: ancho, height: alto })
      for (const ruta of ['/pos', '/clientes', '/servicio']) {
        await page.goto(ruta)
        await expect(page.getByTestId('shell')).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(600)
        const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
        expect(desborda, `${ruta} desborda a ${ancho}px`).toBe(false)
      }
    }
  })
})
