// #314 — Cotizaciones: fixtures demo en distintas etapas, modal con etiquetas
// claras y vista previa del documento antes de guardar/enviar.
//
// Recorre el pipeline completo en la demo: fixtures (borrador, enviada,
// aceptada, rechazada, vencida y convertida), alta guiada, vista previa,
// enviar → aceptar → convertir (el pedido aparece en Pedidos) y aprobación
// desde el portal público con código (misma pestaña, historial y evidencia).
// Capturas: MOBOS_CAPTURAS=docs/QA-314-cotizaciones npx playwright test e2e/qa-314-cotizaciones.spec.js
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-314-cotizaciones'

async function abrirDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Vendedor/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  // Primero el panel (en dev la primera compilación puede demorar) y recién
  // ahí la guía: si monta después del margen del helper, igual se cierra.
  await page.getByTestId('shell').waitFor({ timeout: 30_000 })
  await cerrarGuiaDemo(page, { timeout: 8000 })
}

async function irACotizaciones(page) {
  await page.getByTestId('shell-lateral').getByRole('button', { name: 'Cotizaciones' }).first().click()
  await page.getByTestId('cotizacion-fila').first().waitFor({ timeout: 20_000 })
}

async function irAPedidos(page) {
  await page.getByTestId('shell-lateral').getByRole('button', { name: 'Mis pedidos' }).first().click()
  await page.getByTestId('pedido-fila').first().waitFor({ timeout: 20_000 })
}

async function abrirNuevaCotizacion(page) {
  await page.getByRole('button', { name: '+ Nueva cotización' }).first().click()
  const modal = page.getByRole('dialog', { name: 'Nueva cotización' })
  await modal.waitFor({ timeout: 10_000 })
  return modal
}

/** Alta mínima: consumidor final, un ítem libre. Devuelve el nombre del ítem. */
async function crearCotizacionDemo(page, modal, { descripcion = 'Equipo de prueba demo', cantidad = '2', precio = '150000' } = {}) {
  await modal.getByTestId('cotizacion-consumidor-final').click()
  await modal.getByPlaceholder('Descripción del ítem').fill(descripcion)
  await modal.getByLabel('Cantidad del ítem').fill(cantidad)
  await modal.getByLabel('Precio unitario del ítem').fill(precio)
  await modal.getByRole('button', { name: 'Crear cotización' }).click()
  await expect(page.getByText(/Cotización creada/)).toBeVisible({ timeout: 10_000 })
  return descripcion
}

test('cotizaciones demo: fixtures en etapas, estado vacío y modal con etiquetas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)
  await irACotizaciones(page)
  await page.waitForTimeout(300)

  // Fixtures en todas las etapas del pipeline.
  const filas = page.getByTestId('cotizacion-fila')
  await expect(filas).toHaveCount(6)
  const estados = await filas.evaluateAll((nodos) => nodos.map((nodo) => nodo.getAttribute('data-estado')))
  for (const etapa of ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']) {
    expect(estados, `falta la etapa ${etapa} en la lista demo`).toContain(etapa)
  }
  await page.screenshot({ path: `${SHOTS}/claro-01-lista.png` })

  // Estado vacío: sin encabezados sueltos ni espacio muerto.
  await page.getByLabel('Buscar cotizaciones').fill('zzz-no-existe')
  await expect(page.getByText('No hay cotizaciones en esta vista.')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('cotizaciones-tabla')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/claro-02-vacio.png` })
  await page.getByLabel('Buscar cotizaciones').fill('')

  // Modal: etiquetas visibles en todos los campos y la fila inicial sin Eliminar.
  const modal = await abrirNuevaCotizacion(page)
  for (const etiqueta of ['Cliente', 'Válida hasta', 'Producto', 'Cantidad', 'Precio unitario', 'Descripción', 'Descuento (Gs)', 'Notas']) {
    await expect(modal.getByText(etiqueta, { exact: true }).first(), `falta la etiqueta ${etiqueta}`).toBeVisible()
  }
  await expect(modal.getByRole('button', { name: 'Quitar ítem' })).toHaveCount(0)
  await modal.getByRole('button', { name: '+ Agregar ítem' }).click()
  await expect(modal.getByRole('button', { name: 'Quitar ítem' })).toHaveCount(2)
  await modal.getByRole('button', { name: 'Quitar ítem' }).last().click()
  await expect(modal.getByRole('button', { name: 'Quitar ítem' })).toHaveCount(0)

  // «Consumidor final» es una opción explícita, no un nombre suelto.
  const consumidor = modal.getByTestId('cotizacion-consumidor-final')
  await expect(consumidor).toHaveText(/consumidor final \(sin ficha\)/i)
  await consumidor.click()
  await expect(consumidor).toHaveAttribute('aria-pressed', 'true')
  await expect(modal.getByLabel('Cliente')).toHaveValue('Consumidor final')
  await expect(modal.getByText('Sin ficha: se guarda solo el nombre.')).toBeVisible()

  // Vista previa del documento antes de guardar.
  await modal.getByPlaceholder('Descripción del ítem').fill('Equipo de prueba demo')
  await modal.getByLabel('Cantidad del ítem').fill('2')
  await modal.getByLabel('Precio unitario del ítem').fill('150000')
  await expect(modal.getByTestId('cotizacion-total')).toContainText('300.000')
  await page.screenshot({ path: `${SHOTS}/claro-03-modal.png` })
  await modal.getByRole('button', { name: 'Vista previa' }).click()
  const previa = page.getByTestId('cotizacion-previa')
  await expect(previa).toBeVisible({ timeout: 10_000 })
  await expect(previa).toContainText('Consumidor final')
  await expect(previa).toContainText('300.000')
  await page.screenshot({ path: `${SHOTS}/claro-04-previa.png` })
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await expect(previa).toHaveCount(0)
  await modal.getByRole('button', { name: 'Cancelar' }).click()
  await expect(modal).toHaveCount(0)
})

test('cotizaciones demo: de borrador a pedido y aprobación desde el portal', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)
  await irACotizaciones(page)

  // Alta → enviar → aceptar → convertir: el pedido aparece en Pedidos.
  const modal = await abrirNuevaCotizacion(page)
  const descripcion = `Equipo pipeline ${Date.now().toString(36)}`
  await crearCotizacionDemo(page, modal, { descripcion })
  const fila = page.getByTestId('cotizacion-fila').filter({ hasText: descripcion }).first()
  await expect(fila).toHaveAttribute('data-estado', 'DRAFT')
  await fila.getByRole('button', { name: 'Enviar' }).click()
  await expect(fila).toHaveAttribute('data-estado', 'SENT', { timeout: 10_000 })
  await fila.getByRole('button', { name: 'Aceptar' }).click()
  await expect(fila).toHaveAttribute('data-estado', 'ACCEPTED', { timeout: 10_000 })
  await fila.getByRole('button', { name: 'Convertir' }).click()
  await expect(fila).toHaveAttribute('data-estado', 'CONVERTED', { timeout: 10_000 })
  const numero = (await fila.innerText()).match(/AUR-#\d{4}/)?.[0]
  expect(numero, 'la cotización convertida muestra su pedido').toBeTruthy()
  await page.screenshot({ path: `${SHOTS}/claro-05-convertida.png` })

  // El pedido quedó en Pedidos (navegación SPA: la demo vive en memoria).
  await irAPedidos(page)
  await page.getByLabel('Buscar pedidos').fill(numero.replace(/\D/g, ''))
  await page.waitForTimeout(500)
  await expect(page.getByTestId('pedido-fila').filter({ hasText: numero }).first()).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOTS}/claro-06-pedido.png` })

  // Portal público demo: el enlace del fixture se aprueba con código y vuelve.
  await irACotizaciones(page)
  const filaLucia = page.getByTestId('cotizacion-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await expect(filaLucia).toHaveAttribute('data-estado', 'SENT')
  await filaLucia.getByRole('button', { name: 'Enlace/QR' }).click()
  const enlace = page.getByRole('dialog', { name: /Enlace de/ })
  await enlace.waitFor({ timeout: 10_000 })
  await expect(enlace.getByRole('img', { name: 'QR de la cotización' })).toBeVisible()
  await expect(enlace.getByText(/demo-cot-lucia\?demo=1/)).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/claro-07-enlace.png` })
  await page.getByTestId('cotizacion-ver-cliente').click()

  await page.getByTestId('aprobacion-abrir').click()
  await page.getByTestId('aprobacion-enviar').click()
  await page.getByTestId('aprobacion-codigo').fill('123456')
  await page.getByTestId('aprobacion-confirmar').click()
  const evidencia = page.getByTestId('aprobacion-evidencia')
  await expect(evidencia).toBeVisible({ timeout: 10_000 })
  await expect(evidencia).toContainText('Presupuesto aprobado')
  await expect(evidencia).toContainText(/AUR-#\d{4}/)
  await expect(evidencia).toContainText(/con código enviado a/i)
  await page.screenshot({ path: `${SHOTS}/claro-08-portal-aprobado.png` })

  // Volver (SPA): la cotización quedó convertida y el historial lo registra.
  await page.goBack()
  await irACotizaciones(page)
  await expect(filaLucia).toHaveAttribute('data-estado', 'CONVERTED', { timeout: 10_000 })
  await filaLucia.getByRole('button', { name: 'Historial' }).click()
  const historial = page.getByRole('dialog', { name: /Historial de/ })
  await expect(historial.getByText('Aprobada con código')).toBeVisible({ timeout: 10_000 })
  await expect(historial.getByText('Convertida en pedido').first()).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/claro-09-historial.png` })
})

test('cotizaciones demo: modal y lista en oscuro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mobos:theme', 'dark'))
  await abrirDemo(page)
  await irACotizaciones(page)
  await page.screenshot({ path: `${SHOTS}/oscuro-01-lista.png` })
  const modal = await abrirNuevaCotizacion(page)
  await modal.getByTestId('cotizacion-consumidor-final').click()
  await modal.getByPlaceholder('Descripción del ítem').fill('Equipo demo oscuro')
  await modal.getByLabel('Precio unitario del ítem').fill('99000')
  await page.screenshot({ path: `${SHOTS}/oscuro-02-modal.png` })
  await modal.getByRole('button', { name: 'Vista previa' }).click()
  await expect(page.getByTestId('cotizacion-previa')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOTS}/oscuro-03-previa.png` })
})

test('cotizaciones demo: lista, modal y portal en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page)
  // En móvil la navegación vive en el menú: se entra directo.
  await page.goto('/cotizaciones')
  await page.getByTestId('cotizacion-fila').first().waitFor({ timeout: 20_000 })
  await page.screenshot({ path: `${SHOTS}/movil-01-lista.png` })
  const modal = await abrirNuevaCotizacion(page)
  await modal.getByTestId('cotizacion-consumidor-final').click()
  await modal.getByPlaceholder('Descripción del ítem').fill('Equipo demo móvil')
  await modal.getByLabel('Precio unitario del ítem').fill('120000')
  await page.screenshot({ path: `${SHOTS}/movil-02-modal.png` })
  await modal.getByRole('button', { name: 'Vista previa' }).click()
  await expect(page.getByTestId('cotizacion-previa')).toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: `${SHOTS}/movil-03-previa.png` })
  await page.getByRole('button', { name: 'Volver a editar' }).click()
  await modal.getByRole('button', { name: 'Cancelar' }).click()

  // Portal demo en móvil: se ve el detalle y el bloque de aprobación.
  await page.goto('/cotizacion/demo-cot-lucia?demo=1')
  await page.getByTestId('aprobacion-abrir').waitFor({ timeout: 15_000 })
  await page.screenshot({ path: `${SHOTS}/movil-04-portal.png`, fullPage: true })
})
