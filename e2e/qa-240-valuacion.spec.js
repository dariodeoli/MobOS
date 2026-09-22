// #240 ítem 7 — Valuación de trade-in con grado: el valor base (modelo +
// condición) se ajusta con el grado y los hallazgos de la inspección, con el
// detalle de cada descuento. La herramienta la usa el vendedor en /trade-in.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const API = SEED.api
const SALIDA = 'docs/QA-240-7-valuacion-grado'

async function api(page, path, options = {}) {
  return page.evaluate(async ({ api, path, options }) => {
    const response = await fetch(`${api}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }, { api: API, path, options })
}

test('trade-in: el grado y los hallazgos ajustan la valuación con su detalle', async ({ page, browser }) => {
  await page.goto('/clientes')
  const marca = Date.now().toString(36).toUpperCase()
  const modelo = `iPhone 13 QA${marca}`

  // Valor base del modelo + condición (tabla de valores de toma, admin).
  const alta = await api(page, '/api/device-valuations', {
    method: 'POST',
    body: JSON.stringify({ model: modelo, condition: 'USED', baseValuePyg: 1500000, maxValuePyg: 1800000 }),
  })
  expect([200, 201], JSON.stringify(alta.body)).toContain(alta.status)

  // El vendedor abre la herramienta de trade-in.
  const vendedor = await browser.newContext({ storageState: 'e2e/.auth/seller.json' })
  const herramienta = await vendedor.newPage()
  await herramienta.goto('/trade-in')
  await herramienta.getByLabel('Modelo y capacidad').fill(modelo)
  await herramienta.getByLabel('IMEI / serial').fill('356789102345678')
  await expect(herramienta.getByText(/Valor sugerido:/)).toContainText('Gs 1.500.000', { timeout: 15000 })
  await herramienta.screenshot({ path: `${SALIDA}/01-base-modelo-condicion.png` })

  // Hallazgos: pantalla (−18%, mayor) + botones (−5%) → grado sugerido C (−12%)
  // = −35% sobre el base.
  await herramienta.getByRole('checkbox', { name: /Pantalla rota o con fallas/ }).check()
  await herramienta.getByRole('checkbox', { name: /Botones con fallas/ }).check()
  await expect(herramienta.getByText(/−35% por grado y hallazgos/)).toBeVisible()
  const valuada = herramienta.getByRole('status').filter({ hasText: 'Base Gs 1.500.000' })
  await expect(valuada).toContainText('Gs 975.000')
  // El detalle de cada descuento y el grado sugerido.
  await expect(herramienta.getByText(/Grado C · Con marcas visibles/).first()).toBeVisible()
  await expect(herramienta.getByText('Pantalla rota o con fallas').first()).toBeVisible()
  await expect(herramienta.getByText('−18% · −Gs 270.000')).toBeVisible()
  await expect(herramienta.getByText('−5% · −Gs 75.000')).toBeVisible()
  await expect(herramienta.getByText('−12% · −Gs 180.000')).toBeVisible()
  await herramienta.screenshot({ path: `${SALIDA}/02-con-grado-y-hallazgos.png`, fullPage: true })

  // «Usar» del valor valuado llena el valor acordado.
  await herramienta.getByRole('button', { name: 'Usar' }).last().click()
  await expect(herramienta.getByLabel('Valor de toma acordado (Gs)')).toHaveValue('975.000')

  // Al continuar, el resumen de la inspección viaja en el detalle de la condición.
  await herramienta.getByLabel('Detalle de la condición').fill('Pantalla impecable, caja original')
  await herramienta.getByRole('button', { name: 'Continuar en POS' }).click()
  await expect(herramienta).toHaveURL(/\/pos$/, { timeout: 15000 })
  await herramienta.screenshot({ path: `${SALIDA}/03-continuar-en-pos.png` })

  // El grado se sugiere solo con marcas menores (B) y sin hallazgos vuelve a A.
  await herramienta.goto('/trade-in')
  await herramienta.getByLabel('Modelo y capacidad').fill(modelo)
  await herramienta.getByLabel('IMEI / serial').fill('356789102345678')
  await expect(herramienta.getByText(/Valor sugerido:/)).toContainText('Gs 1.500.000', { timeout: 15000 })
  await herramienta.getByRole('checkbox', { name: /Botones con fallas/ }).check()
  // Botones (−5%) + grado sugerido B (−4%) = −9%.
  await expect(herramienta.getByRole('status').filter({ hasText: 'Base Gs 1.500.000' })).toContainText('Gs 1.365.000')
  await herramienta.getByRole('checkbox', { name: /Botones con fallas/ }).uncheck()
  await expect(herramienta.getByRole('status').filter({ hasText: 'Base Gs 1.500.000' })).toContainText('Gs 1.500.000')
  await herramienta.screenshot({ path: `${SALIDA}/04-grado-sugerido.png` })
  await vendedor.close()
})
