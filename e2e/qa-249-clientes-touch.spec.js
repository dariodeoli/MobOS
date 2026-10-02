// #249 · Gate responsive de Clientes (H2/H3/H4): los controles de fila
// (Resumen rápido y menú «…», con las acciones secundarias adentro), los
// chips/solapas y la selección por lote miden ≥44 px de área táctil a 390
// (mobile) y 768 (tablet). #313: en mobile las filas son tarjetas y las
// acciones secundarias viven en el menú; el gate las mide abriéndolo.
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

  // H2 · acciones por fila (la primera fila con acciones cargadas).
  const fila = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Resumen rápido de/ }) }).first()
  await expect(fila).toBeVisible({ timeout: 20000 })
  await medir(page, 'Resumen rápido', fila.getByRole('button', { name: /Resumen rápido de/ }).first())
  await medir(page, 'Menú de acciones', fila.getByRole('button', { name: /Más acciones de/ }).first())

  // #313: las acciones secundarias viven en el «…»; también son táctiles.
  await fila.getByRole('button', { name: /Más acciones de/ }).first().click()
  const menu = page.getByRole('menu', { name: /Acciones de/ }).first()
  await expect(menu).toBeVisible()
  await medir(page, 'Ver ficha completa', menu.getByRole('menuitem', { name: /Ver detalle completo de/ }).first())
  await medir(page, 'Enviar WhatsApp', menu.getByRole('menuitem', { name: /Enviar WhatsApp a/ }).first())
  await medir(page, 'Elegir plantilla', menu.getByRole('menuitem', { name: /Elegir plantilla de WhatsApp/ }).first())
  await page.keyboard.press('Escape')

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

  // #313: en mobile la fila ya es una tarjeta con los accesos a la vista.
  await page.screenshot({ path: `${SALIDA}/02-acciones-390.png` })

  // El toque en el área selecciona de verdad (no abre la ficha).
  await etiqueta.click()
  await expect(page.getByText(/1 seleccionada/)).toBeVisible({ timeout: 10000 })
  await page.screenshot({ path: `${SALIDA}/03-lote-390.png` })

  // El menú de plantilla sigue abriendo desde el ítem ampliado.
  await fila.getByRole('button', { name: /Más acciones de/ }).first().click()
  await menu.getByRole('menuitem', { name: /Elegir plantilla de WhatsApp/ }).first().click()
  const menuWa = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await expect(menuWa).toBeVisible({ timeout: 15000 })
  await menuWa.screenshot({ path: `${SALIDA}/04-plantilla-390.png` })
  await page.keyboard.press('Escape')

  // Tablet: los mismos controles siguen ≥44.
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.reload()
  const filaTablet = page.getByTestId('cliente-fila').filter({ has: page.getByRole('button', { name: /Resumen rápido de/ }) }).first()
  await expect(filaTablet).toBeVisible({ timeout: 20000 })
  await medir(page, 'Tablet · Resumen rápido', filaTablet.getByRole('button', { name: /Resumen rápido de/ }).first())
  await medir(page, 'Tablet · Menú de acciones', filaTablet.getByRole('button', { name: /Más acciones de/ }).first())
  await medir(page, 'Tablet · chip Con deuda', page.getByRole('button', { name: 'Con deuda', exact: true }).first())
  await page.screenshot({ path: `${SALIDA}/05-lista-768.png` })
})
