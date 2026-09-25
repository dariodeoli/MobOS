// #250 · #83 · Repuestos a crédito · impacto en finanzas: cuenta a pagar al
// proveedor (contado vs crédito con vencimiento) y consignación/depósito sin
// impacto hasta el consumo. Capturas antes/después de la tarjeta en Caja.
//
// Los montos del KPI se comparan por diferencia (la base del arnés acumula las
// compras de corridas anteriores) y cada compra lleva un concepto único para
// ubicar su fila sin depender de las demás.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.env.QA_REPUESTOS_CAPTURAS || join('test-results', 'qa-repuestos')
mkdirSync(DIR, { recursive: true })
const capturar = (objetivo, nombre) => objetivo.screenshot({ path: join(DIR, `repuestos-${nombre}${process.env.QA_REPUESTOS_FASE ? `-${process.env.QA_REPUESTOS_FASE}` : ''}.png`) })

const hoy = new Date()
const dias = (n) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10)
const unico = (base) => `${base} ${Date.now().toString(36)}`

async function abrirCaja(page) {
  await page.goto('/finanzas/caja')
  // El KPI de finanzas llega con la cuenta: en «antes» la tarjeta no existe.
  await expect(page.getByText('Por cobrar')).toBeVisible({ timeout: 20_000 })
}

async function montoDe(page, testId) {
  const texto = (await page.getByTestId(testId).textContent()) || ''
  return Number(texto.replace(/[^\d]/g, '') || 0)
}

function filaDe(page, concepto) {
  return page.locator('div[data-testid^="proveedor-"]').filter({ hasText: concepto }).first()
}

async function registrar(page, { proveedor, concepto, condicion, monto, vence }) {
  await page.getByRole('button', { name: 'Registrar compra' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Registrar compra de repuestos' })
  await dialogo.getByLabel('Proveedor').fill(proveedor)
  await dialogo.getByLabel('Qué se compró').fill(concepto)
  await dialogo.getByLabel('Condición de pago').selectOption(condicion)
  await dialogo.getByLabel('Monto (Gs)').fill(monto)
  if (vence) await dialogo.getByLabel('Vencimiento').fill(vence)
  await dialogo.getByRole('button', { name: 'Registrar compra' }).click()
  await expect(dialogo).toBeHidden({ timeout: 15_000 })
}

test('la compra a crédito impacta con vencimiento y el pago baja el saldo', async ({ page }) => {
  await abrirCaja(page)
  await capturar(page, 'caja')
  const antes = await montoDe(page, 'proveedores-por-pagar')
  const concepto = unico('Pantallas a crédito')
  await registrar(page, { proveedor: 'Proveedor Crédito E2E', concepto, condicion: 'CREDITO', monto: '1250000', vence: dias(-5) })
  await expect(filaDe(page, concepto)).toBeVisible({ timeout: 15_000 })
  await expect(filaDe(page, concepto).getByText('Vencida')).toBeVisible()
  await expect.poll(() => montoDe(page, 'proveedores-por-pagar'), { timeout: 15_000 }).toBe(antes + 1250000)
  await expect.poll(() => montoDe(page, 'proveedores-vencidas'), { timeout: 15_000 }).toBeGreaterThanOrEqual(1250000)
  await capturar(page, 'credito-vencido')
  // El crédito sin vencimiento no se acepta (el botón queda deshabilitado).
  await page.getByRole('button', { name: 'Registrar compra' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Registrar compra de repuestos' })
  await dialogo.getByLabel('Proveedor').fill('Proveedor Crédito E2E')
  await dialogo.getByLabel('Qué se compró').fill('Sin fecha')
  await dialogo.getByLabel('Condición de pago').selectOption('CREDITO')
  await dialogo.getByLabel('Monto (Gs)').fill('10000')
  await expect(dialogo.getByRole('button', { name: 'Registrar compra' })).toBeDisabled()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialogo).toBeHidden()
  // Pagar: baja el saldo de esa compra.
  const parcial = await montoDe(page, 'proveedores-por-pagar')
  await filaDe(page, concepto).getByRole('button', { name: 'Pagar' }).click()
  const pago = page.getByRole('dialog', { name: 'Pagar al proveedor' })
  await pago.getByLabel('Monto (Gs)').fill('250000')
  await pago.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(pago).toBeHidden({ timeout: 15_000 })
  await expect.poll(() => montoDe(page, 'proveedores-por-pagar'), { timeout: 15_000 }).toBe(parcial - 250000)
  await expect(filaDe(page, concepto).getByText('1.000.000')).toBeVisible()
  await capturar(page, 'credito-pagado')
})

test('la consignación no impacta hasta el consumo', async ({ page }) => {
  await abrirCaja(page)
  const antes = await montoDe(page, 'proveedores-por-pagar')
  const depositoAntes = await montoDe(page, 'proveedores-deposito')
  const concepto = unico('Baterías en depósito')
  await registrar(page, { proveedor: 'Depósito 2 E2E', concepto, condicion: 'CONSIGNACION', monto: '800000' })
  await expect(filaDe(page, concepto)).toBeVisible({ timeout: 15_000 })
  await expect(filaDe(page, concepto).getByText('En consignación')).toBeVisible()
  // Sin impacto en «por pagar»: todo queda como tenencia del proveedor.
  await expect.poll(() => montoDe(page, 'proveedores-deposito'), { timeout: 15_000 }).toBe(depositoAntes + 800000)
  expect(await montoDe(page, 'proveedores-por-pagar')).toBe(antes)
  await capturar(page, 'consignacion')
  // Consumir 300.000: esa parte pasa a pagarse y el depósito baja.
  await filaDe(page, concepto).getByRole('button', { name: 'Consumir' }).click()
  const consumo = page.getByRole('dialog', { name: 'Registrar consumo' })
  await consumo.getByLabel('Monto (Gs)').fill('300000')
  await consumo.getByRole('button', { name: 'Registrar consumo' }).click()
  await expect(consumo).toBeHidden({ timeout: 15_000 })
  await expect.poll(() => montoDe(page, 'proveedores-por-pagar'), { timeout: 15_000 }).toBe(antes + 300000)
  await expect.poll(() => montoDe(page, 'proveedores-deposito'), { timeout: 15_000 }).toBe(depositoAntes + 500000)
  await expect(filaDe(page, concepto).getByText('300.000')).toBeVisible()
})

test('la compra de contado no queda pendiente', async ({ page }) => {
  await abrirCaja(page)
  const antes = await montoDe(page, 'proveedores-por-pagar')
  const depositoAntes = await montoDe(page, 'proveedores-deposito')
  await registrar(page, { proveedor: 'Proveedor Contado E2E', concepto: unico('Repuestos al contado'), condicion: 'CONTADO', monto: '300000' })
  // La compra al contado nace pagada: no aparece como cuenta por pagar ni
  // cambia la tenencia del proveedor.
  await page.waitForTimeout(700)
  expect(await montoDe(page, 'proveedores-por-pagar')).toBe(antes)
  expect(await montoDe(page, 'proveedores-deposito')).toBe(depositoAntes)
  await capturar(page, 'contado')
})
