// Finanzas › Verificación: el día por categoría con el detalle por pedido,
// «Verificar categoría», verificar uno a uno y registrar una discrepancia.
// Usa una cuenta PIX propia de la spec (la política «verificar» solo rige para
// ella) para no tocar los cobros de otras specs.
import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'
import { esperarAnimaciones } from './helpers/animaciones.js'
import {
  activarVerificacion, vendedorApi, crearCuentaYProducto, pedidoDelVendedor, restaurarVerificacion, subirComprobante,
} from './helpers/pagos-verificar.js'

test.describe.configure({ mode: 'serial' })

const sufijo = Date.now().toString(36).toUpperCase()
let original
let vendedor
let cobros = {}

const linea = (page, referencia) => page.getByTestId('verificacion-linea').filter({ hasText: referencia })
const categoriaPix = (page) => page.locator('[data-testid="verificacion-categoria"][data-categoria="PIX"]')
// El administrador elige la sucursal del día: la del vendedor del arnés (la misma de los cobros).
async function elegirSucursal(page) {
  const selector = page.locator('#verificacion-sucursal')
  await page.getByTestId('verificacion-diaria').waitFor({ timeout: 20_000 })
  if (await selector.count()) await selector.selectOption(SEED.branchId)
}
const numero = (cobro) => String(cobro.pedido.orderNumber).replace(/^#/, '')

test.afterAll(async () => {
  restaurarVerificacion(original)
  await vendedor?.dispose()
})

test('prepara tres cobros PIX del día y los muestra por categoría con el detalle por pedido', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/resumen')
  const { cuenta, producto } = await crearCuentaYProducto(page, { kind: 'PIX', sufijo })
  original = activarVerificacion([cuenta.id])
  vendedor = await vendedorApi()
  const base = { producto, cuenta }
  // La referencia no aparece en la línea del día: se identifica por el número de pedido.
  const uno = await pedidoDelVendedor(vendedor, { ...base, monto: 310500, referencia: `V1-${sufijo}` })
  const dos = await pedidoDelVendedor(vendedor, { ...base, monto: 220500, referencia: `V2-${sufijo}` })
  const tres = await pedidoDelVendedor(vendedor, { ...base, monto: 150000, referencia: `V3-${sufijo}` })
  for (const cobro of [uno, dos, tres]) await subirComprobante(vendedor, cobro.pago.id)
  cobros = { uno, dos, tres }

  await page.goto('/finanzas/verificacion-dia')
  await expect(page.getByTestId('verificacion-diaria')).toBeVisible({ timeout: 20_000 })
  await elegirSucursal(page)
  await expect(page.getByTestId('verificacion-estado-dia')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('verificacion-totales')).toContainText('Cobrado del día')

  await expect(categoriaPix(page)).toBeVisible()
  await expect(categoriaPix(page).getByTestId('verificacion-categoria-total')).toContainText('681.000')
  const l1 = linea(page, numero(uno))
  await expect(l1).toContainText('310.500')
  await expect(l1).toContainText('Pendiente de aprobación')
  await expect(l1).toContainText('cobrado por')
  if (process.env.MOBOS_CAPTURAS) await page.screenshot({ path: `${process.env.MOBOS_CAPTURAS}/autorizaciones-verificacion.png`, fullPage: true })
})

test('verificar uno a uno y registrar una discrepancia por pedido', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/finanzas/verificacion-dia')
  await elegirSucursal(page)
  const l1 = linea(page, numero(cobros.uno))
  await expect(l1).toBeVisible({ timeout: 20_000 })

  await l1.getByTestId('verificar-uno').click()
  await expect(l1).toContainText('Verificado', { timeout: 15_000 })
  await expect(l1.getByTestId('verificar-uno')).toHaveCount(0)

  // Discrepancia por línea: lo recibido no puede coincidir y el motivo es obligatorio.
  await linea(page, numero(cobros.dos)).getByRole('button', { name: /Registrar discrepancia del pedido/ }).click()
  const dialogo = page.getByRole('dialog', { name: 'Registrar discrepancia' })
  await expect(dialogo.getByTestId('discrepancia-esperado')).toContainText('220.500')
  await dialogo.getByLabel('Monto recibido (Gs.)').fill('220500')
  await dialogo.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialogo.getByTestId('discrepancia-error')).toContainText('coincide con lo esperado')
  await dialogo.getByLabel('Monto recibido (Gs.)').fill('200000')
  await dialogo.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialogo.getByTestId('discrepancia-error')).toContainText('motivo')
  await dialogo.getByLabel('Motivo de la diferencia').fill('El banco acreditó menos por comisión.')
  await dialogo.getByRole('button', { name: 'Registrar' }).click()
  await expect(dialogo).toBeHidden({ timeout: 15_000 })

  const fila = page.getByTestId('discrepancia-fila').filter({ hasText: 'El banco acreditó menos por comisión.' })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText('220.500')
  await expect(fila).toContainText('200.000')
  await expect(fila).toContainText('Abierta')
  await expect(page.getByTestId('verificacion-estado-dia')).toHaveText('Con discrepancias')
})

test('verificar categoría aprueba lo que queda de PIX y resuelve el resto del día', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/finanzas/verificacion-dia')
  await elegirSucursal(page)
  const l2 = linea(page, numero(cobros.dos))
  const l3 = linea(page, numero(cobros.tres))
  await expect(l2).toContainText('Pendiente de aprobación', { timeout: 20_000 })

  const pix = categoriaPix(page)
  await pix.getByTestId('verificar-categoria').click()
  const confirmar = page.getByRole('alertdialog', { name: /Verificar PIX/ })
  await expect(confirmar).toBeVisible()
  await confirmar.getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByTestId('verificacion-resultado')).toContainText('verificado', { timeout: 20_000 })
  await expect(l2).toContainText('Verificado')
  await expect(l3).toContainText('Verificado')

  // Idempotente: repetir no cambia nada (el botón ya no ofrece pendientes).
  await expect(pix.getByTestId('verificar-categoria')).toBeDisabled()
})

test('375 px: la verificación del día no tiene scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/finanzas/verificacion-dia')
  await elegirSucursal(page)
  await expect(page.getByTestId('verificacion-estado-dia')).toBeVisible({ timeout: 20_000 })
  await esperarAnimaciones(page)
  const medida = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }))
  expect(medida.ancho).toBeLessThanOrEqual(medida.visible + 1)
  const boton = page.getByTestId('verificar-todos')
  const caja = await boton.boundingBox()
  expect(caja.height).toBeGreaterThanOrEqual(43.5)
})
