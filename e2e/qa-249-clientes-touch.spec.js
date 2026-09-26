// #249 · Gate responsive de Clientes (H2/H3/H4): los controles de fila
// (Resumen rápido, detalle, WhatsApp, plantilla), los chips/solapas y la
// selección por lote miden ≥44 px de área táctil a 390 (mobile) y 768 (tablet).
// Deja capturas del antes/después en docs/QA-249-clientes-responsive/.
import { test, expect } from '@playwright/test'

const SALIDA = 'test-results/QA-249-clientes-responsive'

// #249: la medida es el AREA TACTIL (la caja dibujada puede ser 36 con
// .toque-44, como en el resto de los gates): rect + ::after expandido.
async function caja(locator) {
  const rect = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    let ancho = box.width
    let alto = box.height
    const after = getComputedStyle(el, '::after')
    if (after && after.content && after.content !== 'none' && after.position === 'absolute') {
      const anchoAfter = parseFloat(after.width)
      const altoAfter = parseFloat(after.height)
      if (Number.isFinite(anchoAfter)) ancho = Math.max(ancho, anchoAfter)
      if (Number.isFinite(altoAfter)) alto = Math.max(alto, altoAfter)
    }
    return { ancho: Math.round(ancho), alto: Math.round(alto) }
  })
  return rect || null
}

async function medir(page, nombre, locator, minimo = 44) {
  const medida = await caja(locator)
  expect(medida, `${nombre}: no se encontró el control`).toBeTruthy()
  expect(medida.ancho, `${nombre}: área táctil ${medida.ancho} < ${minimo}`).toBeGreaterThanOrEqual(minimo)
  expect(medida.alto, `${nombre}: área táctil ${medida.alto} < ${minimo}`).toBeGreaterThanOrEqual(minimo)
  return medida
}

test('clientes: acciones de fila, chips y lote con área táctil ≥44 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/clientes')
  const lista = page.getByTestId('cliente-fila').first()
  await expect(lista).toBeVisible({ timeout: 20000 })

  // H2 · acciones por fila (la primera fila con WhatsApp cargado).
  const fila = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Enviar WhatsApp a/ }) }).first()
  await expect(fila).toBeVisible({ timeout: 20000 })
  await medir(page, 'Resumen rápido', fila.getByRole('button', { name: /Resumen rápido de/ }).first())
  await medir(page, 'Ver detalle completo', fila.getByRole('button', { name: /Ver detalle completo de/ }).first())
  await medir(page, 'WhatsApp', fila.getByRole('button', { name: /Enviar WhatsApp a/ }).first())
  await medir(page, 'Elegir plantilla', fila.getByRole('button', { name: /Elegir plantilla de WhatsApp para/ }).first())

  // H3 · chips de filtro y solapas.
  await medir(page, 'Chip Todos', page.getByRole('button', { name: 'Todos', exact: true }).first())
  await medir(page, 'Chip Con deuda', page.getByRole('button', { name: 'Con deuda', exact: true }).first())
  await medir(page, 'Solapa Campañas', page.locator('button[aria-pressed]', { hasText: 'Campañas' }).first())

  // H4 · selección por lote: el cuadrado de 16 px vive en un área de 44.
  const etiqueta = page.locator('label:has(input[aria-label^="Seleccionar a "])').first()
  await medir(page, 'Área de la casilla de lote', etiqueta)
  const encabezado = page.locator('label:has(input[aria-label="Seleccionar visibles"])').first()
  await medir(page, 'Área de seleccionar visibles', encabezado)

  await page.screenshot({ path: `${SALIDA}/01-lista-390.png` })

  // Las acciones viven al final de la tabla (scroll propio): captura con la
  // tabla desplazada para mostrar los tres targets ampliados.
  await page.getByTestId('clientes-tabla').evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${SALIDA}/02-acciones-390.png` })

  // El toque en el área selecciona de verdad (no abre la ficha).
  await etiqueta.click()
  await expect(page.getByText(/1 seleccionada/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: `${SALIDA}/03-lote-390.png` })

  // El menú de plantilla sigue abriendo desde el botón ampliado (captura del
  // propio menú: Playwright lo lleva a la vista antes de disparar).
  await fila.getByRole('button', { name: /Elegir plantilla de WhatsApp para/ }).first().click()
  const menu = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await expect(menu).toBeVisible({ timeout: 15000 })
  await menu.screenshot({ path: `${SALIDA}/04-plantilla-390.png` })
  await page.keyboard.press('Escape')

  // Tablet: los mismos controles siguen ≥44.
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.reload()
  const filaTablet = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Enviar WhatsApp a/ }) }).first()
  await expect(filaTablet).toBeVisible({ timeout: 20000 })
  await medir(page, 'Tablet · Resumen rápido', filaTablet.getByRole('button', { name: /Resumen rápido de/ }).first())
  await medir(page, 'Tablet · WhatsApp', filaTablet.getByRole('button', { name: /Enviar WhatsApp a/ }).first())
  await medir(page, 'Tablet · chip Con deuda', page.getByRole('button', { name: 'Con deuda', exact: true }).first())
  await page.screenshot({ path: `${SALIDA}/05-lista-768.png` })
})
