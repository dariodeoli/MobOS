// Verificación post-deploy de Finanzas en el demo público anónimo (#196/#185).
//
// Corre contra la base de Playwright (local en CI) o contra un deploy real con
// `DEMO_BASE_URL=https://app.moboss.online npx playwright test e2e/demo-finanzas-anonimo.spec.js --project=core`.
//
// Los chequeos de las funciones de #194 son "soft": si el deploy todavía no las
// tiene, el test las lista como pendientes en vez de cortar el recorrido.
import { test, expect } from '@playwright/test'

const BASE = (process.env.DEMO_BASE_URL || '').replace(/\/$/, '')
const API_PORT = process.env.MOBOS_E2E_API_PORT || '3001'
const esLlamadaApi = (url) => url.includes(`localhost:${API_PORT}`) || url.includes('api.moboss.online')
const url = (ruta) => `${BASE}${ruta}`

async function entrarDemo(page) {
  await page.goto(url('/demo'))
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((destino) => !destino.pathname.startsWith('/demo'))
  await expect(page.getByText(/los datos son ficticios/).first()).toBeVisible()
}

async function crearCuenta(page, { kind, campos = {}, nombre }) {
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.locator('[data-testid="cuenta-form"]').waitFor()
  await page.selectOption('#pa-kind', kind)
  for (const [selector, valor] of Object.entries(campos)) {
    if (selector === 'banco') {
      await page.fill('#pa-bank', valor)
      await page.getByRole('option', { name: new RegExp(valor) }).first().click()
    } else if (selector === 'procesadora') {
      await page.selectOption('#pa-processor', valor)
    } else if (selector === '#pa-currency') {
      await page.selectOption(selector, valor)
    } else {
      await page.fill(selector, valor)
    }
  }
  await expect(page.locator('#pa-name')).toHaveValue(nombre)
  await page.getByRole('button', { name: 'Guardar cuenta' }).click()
  await expect(page.getByText('Cuenta guardada.')).toBeVisible()
}

test.describe('demo anónimo · Finanzas', () => {
  test('cuentas/medios, caja, conciliación y seguro con datos ficticios y sin API', async ({ page }) => {
    const llamadas = []
    page.on('request', (req) => { if (esLlamadaApi(req.url())) llamadas.push(req.url()) })

    await entrarDemo(page)

    // ── Cuentas y medios: efectivo multi-moneda, tarjeta/procesadora, Pix y USDT.
    await page.goto(url('/finanzas/bancos'))
    await expect(page.getByRole('heading', { name: 'Bancos y cuentas' })).toBeVisible()
    await crearCuenta(page, { kind: 'CASH', campos: { '#pa-currency': 'USD' }, nombre: /Efectivo USD/ })
    await crearCuenta(page, { kind: 'CARD', campos: { procesadora: 'Bancard' }, nombre: /Bancard/ })
    await crearCuenta(page, { kind: 'PIX', campos: { '#pa-holder': 'Titular Demo' }, nombre: /Pix - Titular Demo/ })
    await crearCuenta(page, { kind: 'CRYPTO', campos: { '#pa-holder': 'Titular Demo' }, nombre: /USDT - Titular Demo/ })
    // Pix fija BRL y USDT fija USD: sin selector de moneda.
    await page.getByRole('button', { name: 'Añadir cuenta' }).click()
    await page.selectOption('#pa-kind', 'PIX')
    await expect(page.getByText('BRL · Reales')).toBeVisible()
    await page.selectOption('#pa-kind', 'CRYPTO')
    await expect(page.getByText('USD · Dólares')).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar' }).click()

    // ── Caja: turno demo coherente (con apertura y arqueo).
    await page.goto(url('/finanzas/caja'))
    await expect(page.getByText('Abierta', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin apertura')).toHaveCount(0)
    await expect(page.getByText(/Turno de /)).toBeVisible()

    // ── Conciliación (#194): disponible con datos ficticios y lote local.
    await page.goto(url('/finanzas/conciliacion'))
    const notaConciliacion = await page.getByText('Demo: cobros y cuentas ficticios')
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => 1).catch(() => 0)
    expect.soft(notaConciliacion, 'conciliación en demo (#194): falta deployar').toBe(1)
    if (notaConciliacion) {
      const filas = page.getByTestId('conciliacion-fila')
      await expect(filas.first()).toBeVisible()
      await filas.nth(0).getByRole('checkbox').check()
      await filas.nth(1).getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Conciliar lote' }).click()
      await expect(page.getByText(/Lote conciliado \(demo\)/)).toBeVisible()
      await expect(page.getByTestId('conciliacion-lote').first()).toBeVisible()
    }

    // ── Auditoría de caja (#194): medios y efectivo visibles en demo.
    await page.goto(url('/finanzas/caja'))
    const auditoriaMedios = await page.getByText('Entradas por medio de pago')
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => 1).catch(() => 0)
    const auditoriaEfectivo = await page.getByText('Auditoría de efectivo')
      .waitFor({ state: 'visible', timeout: 15000 }).then(() => 1).catch(() => 0)
    expect.soft(auditoriaMedios, 'auditoría de medios en demo (#194): falta deployar').toBe(1)
    expect.soft(auditoriaEfectivo, 'auditoría de efectivo en demo (#194): falta deployar').toBe(1)

    // ── Seguro (#188/#194): nunca "Falta sesión"; en demo se simula.
    await page.goto(url('/configuracion/negocio'))
    await page.locator('#seguro-toggle').waitFor({ state: 'attached', timeout: 15000 })
    await expect(page.getByText('Falta sesión')).toHaveCount(0)
    const guardarSeguro = page.getByRole('button', { name: 'Guardar seguro' })
    if (await guardarSeguro.isEnabled()) {
      await page.locator('#seguro-toggle').check({ force: true })
      await guardarSeguro.click()
      await expect(page.getByText('Seguro guardado en este navegador (demo).')).toBeVisible()
      await page.goto(url('/analisis/ganancias'))
      await expect(page.getByText('Incluye seguro 25% (demo)')).toBeVisible()
    } else {
      const notaSeguro = await page.getByText(/no se guardan los límites ni el seguro/)
        .waitFor({ state: 'visible', timeout: 15000 }).then(() => 1).catch(() => 0)
      expect.soft(notaSeguro, 'seguro simulable en demo (#194): falta deployar').toBe(1)
    }

    // ── Criterio de #192: la demo no toca el API real.
    expect(llamadas, `llamadas al API dentro de la demo: ${llamadas.join(', ')}`).toEqual([])
  })
})
