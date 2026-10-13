// #249: auditoría responsive mobile de Inventario.
// Mide targets reales a 390 px (mobile: ≥44×44) y en escritorio (fila de Stock
// de una línea: el botón de acciones de 44 px fija el alto, ≤60 px). Capturas del antes/después en
// docs/qa/249-inventario-responsive/ (el "antes" sale de producción).
//
// #245 (hardening): esperas deterministas (cada medición espera a que el target
// esté visible, sin subir timeouts) y locators estables: la casilla se toca por
// su etiqueta de 44 px real y la ficha se abre tocando la fila, sin depender del
// ancho del nombre (con seriales largos se comprimía a 0 px y Playwright
// reintentaba el clic hasta agotar el timeout).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const SALIDA = 'test-results/qa-249-inventario'
const MINIMO_TOQUE = 44
const MINIMO_NOMBRE = 40

const caja = async (locator) => {
  await expect(locator, `sin caja para ${locator}`).toBeVisible()
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

test('mobile 390: los targets de la tarjeta y la ficha llegan a 44', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/stock/unidades')
  // #304: en móvil el listado son tarjetas compactas (la tabla ancha no va).
  const tarjeta = page.getByTestId('inventario-tarjeta-movil').first()
  await expect(tarjeta).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('inventario-tabla')).toHaveCount(0)

  // Stock: la tarjeta entera abre la ficha (no hay botón «Ver» aparte).
  await exigirToque(tarjeta.getByRole('button', { name: /^Ver detalles de/ }), 'tarjeta que abre la ficha (H4)')
  await exigirToque(tarjeta.getByLabel(/^Acciones de/), 'menú Acciones (H4)')
  // #245: el modelo tiene que verse siempre (antes colapsaba a 0 px con seriales largos).
  const nombre = await caja(tarjeta.locator('b').first())
  medidas['nombre del modelo'] = `${nombre.w}x${nombre.h}`
  expect(nombre.w, `nombre ${nombre.w} px < ${MINIMO_NOMBRE}`).toBeGreaterThanOrEqual(MINIMO_NOMBRE)
  await exigirToque(page.getByTestId('tabs-inventario'), 'solapa Inventario (H3)')
  await exigirToque(page.getByLabel('Buscar en inventario'), 'buscador')
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/01-mobile-lista.png`, fullPage: true })

  // Ficha con checklist en mobile: los estados del PhoneCheck a 44.
  await tarjeta.getByRole('button', { name: /^Ver detalles de/ }).click()
  const ficha = page.getByRole('dialog')
  await expect(ficha).toBeVisible({ timeout: 20_000 })
  const checklist = ficha.getByTestId('unidad-phonecheck')
  await expect(checklist).toBeVisible({ timeout: 20_000 })
  await checklist.scrollIntoViewIfNeeded()
  await exigirToque(checklist.getByRole('button', { name: 'Bien' }).first(), 'checklist: Bien')
  await exigirToque(checklist.getByRole('button', { name: 'Con observación' }).first(), 'checklist: Con observación')
  await exigirToque(checklist.getByRole('button', { name: 'Falla' }).first(), 'checklist: Falla')
  await exigirToque(checklist.getByRole('button', { name: 'No aplica' }).first(), 'checklist: No aplica')
  await exigirToque(checklist.getByLabel('Batería %'), 'checklist: batería %')
  await page.screenshot({ path: `${SALIDA}/02-mobile-ficha-checklist.png`, fullPage: true })
  writeFileSync(`${SALIDA}/medidas-mobile.json`, `${JSON.stringify(medidas, null, 2)}\n`)
})

// Por debajo de 1120 px de contenedor la lista pasa a tarjetas naturales
// (stockF4.css); la fila de una línea se audita con el shell ya expandido.
test('escritorio 1440: la fila sigue compacta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // Una unidad del seed con nombre corto: el alto de la fila no depende de datos de otros specs.
  await page.goto('/stock/unidades?q=E2EE2EIPHONE15')
  const fila = page.getByTestId('inventario-fila').first()
  await expect(fila).toBeVisible({ timeout: 20_000 })
  const alto = (await caja(fila)).h
  expect(alto, `fila ${alto} px > 60`).toBeLessThanOrEqual(60)
  const nombre = await caja(fila.locator('b').first())
  medidas['nombre del modelo'] = `${nombre.w}x${nombre.h}`
  expect(nombre.w, `nombre ${nombre.w} px < ${MINIMO_NOMBRE}`).toBeGreaterThanOrEqual(MINIMO_NOMBRE)
  // El menú de acciones de la fila mantiene su zona táctil de 44 px.
  await exigirToque(fila.getByLabel(/^Acciones de/), 'menú Acciones de la fila')
  mkdirSync(SALIDA, { recursive: true })
  await page.screenshot({ path: `${SALIDA}/03-escritorio-768.png`, fullPage: true })
})
