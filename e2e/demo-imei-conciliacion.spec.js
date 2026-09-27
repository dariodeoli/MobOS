// #233: conciliación de una consulta IMEI en la demo pública (misma UX que la
// cuenta real, sin backend): la consulta simulada queda en el registro y
// administración la concilia desde el modal, con la aclaración obligatoria.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { serialDemo } from '../src/lib/demo/iphones.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

// Capturas del QA: viven en test-results para no ensuciar el árbol del release.
const SALIDA = 'test-results/imei-conciliacion'

test('la demo permite conciliar una consulta desde el registro', async ({ page }) => {
  const serial = serialDemo(1)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  // La guía "Cómo funciona la demo" se abre en la primera visita y tapa clics.
  await cerrarGuiaDemo(page)

  // La consulta simulada de la demo queda registrada (estado verificado).
  await page.goto('/inventario/unidades')
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 15_000 })
  await fila.click()
  const ficha = page.getByRole('dialog')
  await ficha.getByTestId('imei-precheck').click()
  await ficha.getByTestId('imei-confirmar').click()
  await expect(ficha.getByText(/Verificado|SIMULADO/).first()).toBeVisible({ timeout: 15_000 })

  // El registro se busca por el serial del demo (AUR…, 16 caracteres) y se concilia.
  await ficha.getByTestId('imei-consultas-abrir').click()
  const ventana = page.getByRole('dialog', { name: 'Consultas IMEI · Conciliar' })
  await ventana.getByLabel('IMEI a consultar').fill(serial)
  await ventana.getByTestId('imei-consultas-buscar').click()
  const registro = ventana.getByTestId('imei-consultas-lista').locator('article').first()
  await expect(registro).toBeVisible({ timeout: 15_000 })
  // La ventana ya no es de solo lectura: el registro ofrece Conciliar.
  await expect(registro.getByRole('button', { name: 'Conciliar' })).toBeVisible()

  await registro.getByRole('button', { name: 'Conciliar' }).click()
  const modal = page.getByRole('dialog', { name: 'Conciliar consulta IMEI' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('iCloud/US Block clean ≠ blacklist mundial', { exact: true })).toBeVisible()
  await expect(modal.getByLabel('Nota de conciliación')).toHaveValue(/iCloud\/US Block clean ≠ blacklist mundial/)
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/03-demo-modal-conciliar.png`, fullPage: true })

  await modal.getByLabel('Costo real USD').fill('0.06')
  await modal.getByLabel('Orden del proveedor').fill('ORD-233-DEMO')
  await page.getByTestId('imei-conciliar-guardar').click()
  await expect(page.getByText('Consulta conciliada.')).toBeVisible({ timeout: 15_000 })
  await expect(registro.getByText(/Conciliada el/)).toBeVisible()
  await expect(registro.getByText(/ORD-233-DEMO/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-demo-consulta-conciliada.png`, fullPage: true })
})

// #257 (demo): las unidades del inventario demo tienen que verse en el POS.
// El modelo «iPhone 12 128GB Verde» nace con una unidad disponible: el POS lo
// muestra con stock y al recibir otra unidad el stock sube sin recargar.
test('la demo muestra en el POS el stock de las unidades del inventario (#257)', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await cerrarGuiaDemo(page)

  const buscador = () => page.getByPlaceholder('Buscar producto…')
  const tarjeta = () => page.getByRole('button', { name: /^iPhone 12 128GB/ }).first()

  // El POS arranca solo: el stock sale de las unidades disponibles del demo (1).
  await page.goto('/pos')
  await expect(buscador()).toBeVisible({ timeout: 25_000 })
  await buscador().fill('iPhone 12 128GB')
  await expect(tarjeta()).toContainText('1 en stock', { timeout: 20_000 })

  // Se recibe una unidad desde Inventario (misma sesión, sin recargar el POS).
  await page.getByRole('button', { name: 'Unidades', exact: true }).first().click()
  await page.getByRole('button', { name: '+ Recibir unidad' }).click()
  const modal = page.getByRole('dialog')
  const combo = modal.getByRole('combobox').first()
  await combo.fill('iPhone 12 128GB Verde')
  await modal.getByRole('option', { name: /iPhone 12 128GB Verde/ }).first().click()
  await modal.getByLabel('IMEI o serial', { exact: true }).fill(serialDemo(99))
  const sucursal = modal.getByLabel('Sucursal', { exact: true })
  if (await sucursal.count()) await sucursal.selectOption('mobos-demo-central')
  await modal.getByRole('button', { name: 'Guardar unidad' }).click()
  await expect(page.getByText(/1 unidad recibida/)).toBeVisible({ timeout: 20_000 })

  // Al volver al POS el stock ya es 2: la unidad nueva es vendible.
  await page.getByRole('button', { name: 'POS', exact: true }).first().click()
  await expect(buscador()).toBeVisible({ timeout: 20_000 })
  await buscador().fill('iPhone 12 128GB')
  await expect(tarjeta()).toContainText('2 en stock', { timeout: 20_000 })
  mkdirSync('test-results/qa-257-demo', { recursive: true })
  await page.screenshot({ path: 'test-results/qa-257-demo/unidad-demo-en-pos.jpg', type: 'jpeg', quality: 78 })
})
