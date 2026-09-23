// #249: auditoría responsive mobile de Inventario.
// Mide targets reales a 390 px (mobile: ≥44×44) y a 768 px (escritorio: fila
// compacta ≤48 px, como pide #246). Capturas del antes/después en
// docs/qa/249-inventario-responsive/ (el "antes" sale de producción).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const SALIDA = 'test-results/qa-249-inventario'
const MINIMO_TOQUE = 44

const caja = async (locator) => {
  const caja = await locator.boundingBox()
  if (!caja) throw new Error(`sin caja para ${locator}`)
  return { w: Math.round(caja.width), h: Math.round(caja.height) }
}

const medidas = {}
const exigirToque = async (locator, nombre) => {
  const { w, h } = await caja(locator)
  medidas[nombre] = `${w}x${h}`
  expect(h, `${nombre} alto ${h} < ${MINIMO_TOQUE}`).toBeGreaterThanOrEqual(MINIMO_TOQUE)
  expect(w, `${nombre} ancho ${w} < ${MINIMO_TOQUE}`).toBeGreaterThanOrEqual(MINIMO_TOQUE)
}

test('mobile 390: los targets de la fila y la ficha llegan a 44', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/inventario/unidades')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20_000 })

  await exigirToque(fila.locator('label').first(), 'casilla de la fila (H4)')
  await exigirToque(fila.getByLabel(/^Editar el costo de/), 'lápiz de costo (H2)')
  await exigirToque(fila.getByLabel('✓ Verificar'), 'verificar (H2)')
  await exigirToque(fila.getByLabel(/^Acciones de/), 'menú Acciones (H2)')
  await exigirToque(fila.getByRole('button', { name: 'Editar', exact: true }), 'Editar (H2)')
  await exigirToque(page.getByRole('button', { name: /^Inventario \(/ }), 'solapa Inventario (H3)')
  await exigirToque(page.getByLabel('Buscar en inventario'), 'buscador')

  // Barra de acciones del lote (aparece al seleccionar).
  await fila.locator('input[type=checkbox]').first().check()
  await exigirToque(page.getByRole('button', { name: 'Verificar todos' }), 'Verificar todos (lote)')
  await exigirToque(page.getByRole('button', { name: 'Vender todos' }), 'Vender todos (lote)')
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/01-mobile-lista.png`, fullPage: true })

  // Ficha con checklist en mobile: los estados del PhoneCheck a 44.
  await fila.locator('input[type=checkbox]').first().uncheck()
  await fila.locator('b').first().click()
  const ficha = page.getByRole('dialog')
  const checklist = ficha.getByTestId('unidad-phonecheck')
  await checklist.scrollIntoViewIfNeeded()
  await exigirToque(checklist.getByRole('button', { name: 'Bien' }).first(), 'checklist: Bien')
  await exigirToque(checklist.getByRole('button', { name: 'Con observación' }).first(), 'checklist: Con observación')
  await exigirToque(checklist.getByRole('button', { name: 'Falla' }).first(), 'checklist: Falla')
  await exigirToque(checklist.getByRole('button', { name: 'No aplica' }).first(), 'checklist: No aplica')
  await exigirToque(checklist.getByLabel('Batería %'), 'checklist: batería %')
  await page.screenshot({ path: `${SALIDA}/02-mobile-ficha-checklist.png`, fullPage: true })
  writeFileSync(`${SALIDA}/medidas-mobile.json`, `${JSON.stringify(medidas, null, 2)}\n`)
})

test('escritorio 768: la fila sigue compacta', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.goto('/inventario/unidades')
  const fila = page.getByTestId('inventario-fila').first()
  await fila.waitFor({ state: 'visible', timeout: 20_000 })
  const alto = (await caja(fila)).h
  expect(alto, `fila ${alto} px > 48`).toBeLessThanOrEqual(48)
  const lapiz = await caja(fila.getByLabel(/^Editar el costo de/))
  expect(lapiz.h, 'el lápiz vuelve chico en escritorio').toBeLessThanOrEqual(36)
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/03-escritorio-768.png`, fullPage: true })
})
