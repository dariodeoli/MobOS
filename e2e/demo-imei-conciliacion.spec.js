// #233: conciliación de una consulta IMEI en la demo pública (misma UX que la
// cuenta real, sin backend): la consulta simulada queda en el registro y
// administración la concilia desde el modal, con la aclaración obligatoria.
import { test, expect } from '@playwright/test'
import { openShellDestination } from './helpers/shell-navigation.js'
import { mkdirSync } from 'node:fs'
import { serialDemo } from '../src/lib/demo/iphones.js'
import { cerrarGuiaDemo } from './helpers/demo.js'

// Capturas del QA: viven en test-results para no ensuciar el árbol del release.
const SALIDA = 'test-results/imei-conciliacion'

test('la demo permite reportar un problema de una consulta desde el registro', async ({ page }) => {
  const serial = serialDemo(1)
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  // La guía "Cómo funciona la demo" se abre en la primera visita y tapa clics.
  await cerrarGuiaDemo(page)

  // La consulta simulada de la demo queda registrada (estado verificado).
  await page.goto('/stock/unidades')
  const campo = page.getByPlaceholder('Escanear IMEI, SKU o buscar modelo')
  await campo.fill(serial)
  await campo.press('Enter')
  // La lista de Stock filtra en el servidor con la búsqueda diferida: se espera
  // la fila del serial pedido, no la primera que aparezca antes de filtrar.
  const fila = page.getByTestId('inventario-fila').filter({ hasText: serial }).first()
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
  // El registro ofrece «Reportar problema» (la conciliación es de la plataforma).
  await expect(registro.getByRole('button', { name: 'Reportar problema' })).toBeVisible()

  await registro.getByRole('button', { name: 'Reportar problema' }).click()
  const modal = page.getByRole('dialog', { name: 'Reportar problema de la consulta' })
  await expect(modal).toBeVisible()
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/03-demo-modal-conciliar.png`, fullPage: true })

  await modal.getByLabel('Qué pasó').fill('No coincide con el panel del proveedor.')
  await page.getByTestId('imei-conciliar-guardar').click()
  await expect(page.getByText('Problema reportado.', { exact: false })).toBeVisible({ timeout: 15_000 })
  await expect(registro.getByText(/Revisada el/)).toBeVisible()
  await page.screenshot({ path: `${SALIDA}/04-demo-consulta-conciliada.png`, fullPage: true })
})

// #257 (demo): las unidades del inventario demo tienen que verse en el POS.
// El POS debe coincidir con las unidades disponibles del inventario, también
// al crecer el catálogo demo; recibir una unidad aumenta el stock en exactamente una.
test('la demo muestra en el POS el stock de las unidades del inventario (#257)', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 60_000 })
  await cerrarGuiaDemo(page)

  const buscador = () => page.getByPlaceholder('Buscar producto…')
  const tarjeta = () => page.getByRole('button', { name: /^iPhone 12 128GB/ }).first()
  const stockPorSucursal = () => tarjeta().getByTestId('pos-stock-por-sucursal')
  // The inventory oracle counts the whole family. Sum its displayed branch
  // rows rather than assuming every available unit belongs to Casa Central.
  const totalVisiblePorSucursal = async () => {
    const rows = (await stockPorSucursal().locator(':scope > span').allTextContents()).slice(1)
    const counts = rows.map(row => row.match(/: (\d+|Agotado)$/)?.[1])
    if (!rows.length || counts.some(value => value === undefined)) return -1
    return counts.reduce((sum, value) => sum + (value === 'Agotado' ? 0 : Number(value)), 0)
  }

  const disponiblesDeLaFamilia = () => page.evaluate(async () => {
    const { listDemoUnits } = await import('/src/lib/demoInventory.js')
    return listDemoUnits().filter(unit => unit.status === 'AVAILABLE'
      && /^iPhone 12 128GB(?:\s|$)/.test(unit.product?.nombre || unit.product?.name || ''))
      .map(unit => ({ id: unit.id, serial: unit.serial }))
  })
  // Oráculo independiente: contar unidades, nunca leer la etiqueta del POS.

  await page.goto('/pos')
  await expect(buscador()).toBeVisible({ timeout: 25_000 })
  await buscador().fill('iPhone 12 128GB')
  const antes = await disponiblesDeLaFamilia()
  expect(antes.length).toBeGreaterThan(0)
  await expect(stockPorSucursal().getByText('Stock por sucursal', { exact: true })).toBeVisible()
  await expect.poll(totalVisiblePorSucursal, { timeout: 20_000 }).toBe(antes.length)

  // Se recibe una unidad desde Inventario (misma sesión, sin recargar el POS).
  await openShellDestination(page, 'Unidades (IMEI)')
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

  const despues = await disponiblesDeLaFamilia()
  expect(despues).toHaveLength(antes.length + 1)
  for (const unidad of antes) expect(despues).toContainEqual(unidad)
  expect(despues.filter(unit => unit.serial === serialDemo(99))).toHaveLength(1)
  // La recepción se refleja sin recargar ni duplicar la unidad.
  await openShellDestination(page, 'POS')
  await expect(buscador()).toBeVisible({ timeout: 20_000 })
  await buscador().fill('iPhone 12 128GB')
  await expect.poll(totalVisiblePorSucursal, { timeout: 20_000 }).toBe(despues.length)
  mkdirSync('test-results/qa-257-demo', { recursive: true })
  if (process.env.MOBOS_QA_SCREENSHOTS !== '0') await page.screenshot({ path: 'test-results/qa-257-demo/unidad-demo-en-pos.jpg', type: 'jpeg', quality: 78 })
})
