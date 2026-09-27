// #250 · FIN · La deuda de repuestos del taller entra en Finanzas: aparece en
// Caja («Repuestos del taller»), suma al KPI «Por pagar» y se paga desde ahí
// con el egreso en la cuenta elegida. Capturas: `QA_TALLER_CAPTURAS` (default
// test-results/qa-fin-taller) — se versionan en docs/qa/fin-repuestos-taller/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SEED } from './helpers/seed-data.js'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`
const DIR = process.env.QA_TALLER_CAPTURAS || join('test-results', 'qa-fin-taller')

// API desde la página: la cookie de sesión y el origen son los de la app.
const apiPagina = (page, ruta, opciones = {}) => page.evaluate(async ({ api, ruta, opciones }) => {
  const response = await fetch(`${api}${ruta}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}, { api: API, ruta, opciones })

const unico = (base) => `${base} ${Date.now().toString(36)}`

async function abrirCaja(page) {
  await page.goto('/finanzas/caja')
  await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 20_000 })
}

async function montoDe(page, testId) {
  // Tolerante: si la sección todavía no existe (sin deuda del taller), no espera.
  const texto = await page.getByTestId(testId).textContent({ timeout: 4000 }).catch(() => '')
  return Number(String(texto || '').replace(/[^\d]/g, '') || 0)
}

test('la deuda del taller entra en «por pagar» y se paga desde Caja con egreso', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await abrirCaja(page)
  await page.screenshot({ path: join(DIR, 'taller-antes-desktop.png') })
  const kpiAntes = await montoDe(page, 'caja-por-pagar')
  const tallerAntes = (await montoDe(page, 'taller-por-pagar').catch(() => 0)) || 0

  // Repuesto a crédito y vencido: deuda 3 × 120.000.
  const nombre = unico('Pantalla taller')
  const vencido = new Date(Date.now() - 5 * 86_400_000).toISOString()
  const creado = await apiPagina(page, '/api/workshop/parts', {
    method: 'POST',
    body: JSON.stringify({ name: nombre, ownership: 'PROPIO', paymentMode: 'CREDITO', quantity: 3, unitCostPyg: 120000, dueAt: vencido, branchId: SEED.branchId }),
  })
  expect([200, 201], `POST /api/workshop/parts → ${creado.status} ${JSON.stringify(creado.body)}`).toContain(creado.status)

  await page.reload()
  await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 20_000 })
  const filas = page.getByTestId('taller-repuestos').locator('div[data-testid^="taller-parte-"]')
  const fila = filas.filter({ hasText: nombre }).first()
  await expect(fila).toBeVisible({ timeout: 15_000 })
  await expect(fila.getByText('Vencida')).toBeVisible()
  await expect(fila.getByText(/360\.000/)).toBeVisible()
  await expect.poll(() => montoDe(page, 'caja-por-pagar'), { timeout: 15_000 }).toBe(kpiAntes + 360000)
  await expect.poll(() => montoDe(page, 'taller-por-pagar'), { timeout: 15_000 }).toBe(tallerAntes + 360000)
  await page.getByTestId('taller-repuestos').screenshot({ path: join(DIR, 'taller-deuda-bloque.png') })
  await page.screenshot({ path: join(DIR, 'taller-deuda-desktop.png'), fullPage: true })

  // Pagar con cuenta: la deuda sale del bloque, el KPI baja y el egreso queda.
  await fila.getByRole('button', { name: 'Pagar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Pagar repuesto del taller' })
  await expect(dialogo).toBeVisible()
  const cuenta = dialogo.locator('#prov-accion-cuenta')
  const valorCuenta = await cuenta.locator('option').nth(1).getAttribute('value')
  await cuenta.selectOption(valorCuenta)
  await dialogo.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(dialogo).toBeHidden({ timeout: 15_000 })
  await expect(filas.filter({ hasText: nombre })).toHaveCount(0)
  await expect.poll(() => montoDe(page, 'caja-por-pagar'), { timeout: 15_000 }).toBe(kpiAntes)
  await page.screenshot({ path: join(DIR, 'taller-pagado-desktop.png'), fullPage: true })

  // El repuesto quedó pago y el egreso quedó registrado en la cuenta elegida.
  const detalle = await apiPagina(page, `/api/workshop/parts?id=${creado.body.id}`)
  expect(detalle.body?.part?.paidAt, 'el repuesto queda pago').toBeTruthy()
  const fin = await apiPagina(page, '/api/finance')
  const movimiento = (fin.body?.movements || []).find((fila2) => fila2.kind === 'SUPPLIER_ADVANCE' && fila2.direction === 'OUT' && Number(fila2.amountPyg) === 360000 && fila2.accountId === valorCuenta)
  expect(movimiento, 'egreso del pago del taller').toBeTruthy()
})
