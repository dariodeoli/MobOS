// #315 — Taller: una sola jerarquía.
//
// Recorre la demo con el criterio de la auditoría: la lista general queda con
// filtros compactos (etapa + panel de filtros avanzados), las etapas viven
// dentro de cada reparación (panel de detalle con el flujo, la inspección
// unificada y las acciones), el alta mantiene sus acciones siempre visibles y
// las plantillas de WhatsApp de la demo salen con datos, sin «Reintentar».
// Capturas: MOBOS_CAPTURAS=docs/QA-315-taller npx playwright test e2e/qa-315-taller.spec.js
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

const SHOTS = process.env.MOBOS_CAPTURAS || 'test-results/QA-315-taller'

async function abrirDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await page.getByTestId('shell-lateral').waitFor({ timeout: 30_000, state: 'attached' })
  await cerrarGuiaDemo(page, { timeout: 8000 })
}

async function irAlTaller(page) {
  await page.goto('/servicio')
  await expect(page.getByTestId('servicio-tabla')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('servicio-fila').first()).toBeVisible()
}

test('taller demo: lista compacta, filtros y detalle de la reparación', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)
  await irAlTaller(page)

  // La etapa se elige en un filtro compacto; los filtros avanzados viven en un
  // panel lateral y no empujan la página.
  const filas = page.getByTestId('servicio-fila')
  const total = await filas.count()
  const etapa = page.getByLabel('Filtrar por etapa')
  await expect(etapa).toBeVisible()
  await etapa.selectOption('DIAGNOSTICO')
  const diagnosticos = await filas.count()
  expect(diagnosticos).toBeGreaterThan(0)
  expect(diagnosticos).toBeLessThan(total)
  await page.screenshot({ path: `${SHOTS}/claro-01-lista.png` })
  await etapa.selectOption('activos')

  await page.getByRole('button', { name: /^Filtros/ }).click()
  const filtros = page.getByRole('dialog', { name: 'Filtros del taller' })
  await expect(filtros).toBeVisible()
  await filtros.getByLabel('Técnico').selectOption('Jorge Villalba')
  await page.screenshot({ path: `${SHOTS}/claro-02-filtros.png` })
  await filtros.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(filas.first()).toBeVisible()
  const conTecnico = await filas.evaluateAll((nodos) => nodos.every((nodo) => (nodo.textContent || '').includes('Jorge Villalba')))
  expect(conTecnico, 'el filtro por técnico deja solo sus órdenes').toBe(true)
  await page.getByRole('button', { name: /^Filtros/ }).click()
  await page.getByRole('dialog', { name: 'Filtros del taller' }).getByRole('button', { name: 'Limpiar' }).click()
  await page.getByRole('dialog', { name: 'Filtros del taller' }).getByRole('button', { name: 'Aplicar filtros' }).click()

  // Detalle: las etapas viven dentro de la reparación y la inspección es una
  // sola (esquema + lista con la misma numeración y un único contador).
  const fila = filas.filter({ hasText: 'OS-#0001' }).first()
  await fila.getByRole('button', { name: /Ver detalle de/ }).click()
  const detalle = page.getByRole('dialog').filter({ has: page.getByTestId('taller-detalle') })
  await expect(detalle).toBeVisible()
  await expect(detalle.getByTestId('taller-pasos').locator('[data-paso]')).toHaveCount(5)
  await expect(detalle.locator('[data-paso="Diagnóstico"][data-activo="true"]')).toHaveCount(1)
  await expect(detalle.getByTestId('inspeccion-equipo')).toBeVisible()
  await expect(detalle.getByTestId('inspeccion-contador')).toContainText(/de \d+ revisados/)
  await page.screenshot({ path: `${SHOTS}/claro-03-detalle.png` })
  await page.keyboard.press('Escape')
  await expect(detalle).toHaveCount(0)
})

test('taller demo: crear una orden y seguirla desde el detalle', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await abrirDemo(page)
  await irAlTaller(page)

  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await modal.getByLabel('Cliente', { exact: true }).fill('Cliente Jerarquía')
  const buscador = modal.getByTestId('recepcion-dispositivo').getByRole('combobox').first()
  await buscador.fill('iPhone 14 Pro')
  await buscador.press('Enter')
  await modal.getByPlaceholder('Qué reporta el cliente').fill('No enciende.')
  // Inspección unificada: el punto 2 se marca desde el dibujo.
  await modal.getByRole('button', { name: /^2\. Cámara frontal/ }).click()
  // Las acciones del alta quedan siempre visibles, sin scrollear el formulario.
  const crear = modal.getByRole('button', { name: 'Crear orden' })
  await expect(crear).toBeInViewport()
  await page.screenshot({ path: `${SHOTS}/claro-04-modal.png` })
  await crear.click()
  await expect(page.getByText('Orden de prueba guardada en este navegador.')).toBeVisible({ timeout: 10_000 })

  const fila = page.getByTestId('servicio-fila').filter({ hasText: 'Cliente Jerarquía' }).first()
  await expect(fila).toBeVisible()

  // El detalle es el lugar de las etapas: se avanza y el paso actual se mueve.
  await fila.getByRole('button', { name: /Ver detalle de/ }).click()
  const detalle = page.getByRole('dialog').filter({ has: page.getByTestId('taller-detalle') })
  await expect(detalle.locator('[data-paso="Recepción"][data-activo="true"]')).toHaveCount(1)
  await detalle.getByRole('button', { name: 'Pasar a Diagnóstico' }).click()
  await expect(detalle.locator('[data-paso="Diagnóstico"][data-activo="true"]')).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/claro-05-avance.png` })
})

test('taller demo: plantillas de WhatsApp con datos y tema oscuro', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => localStorage.setItem('mobos:theme', 'dark'))
  await abrirDemo(page)
  await irAlTaller(page)
  await page.screenshot({ path: `${SHOTS}/oscuro-01-lista.png` })

  // En la demo el menú sale de las plantillas locales del taller: sin error ni
  // «Reintentar».
  const fila = page.getByTestId('servicio-fila').filter({ hasText: 'Lucía Fernández' }).first()
  await fila.getByRole('button', { name: /Elegir plantilla de WhatsApp para Lucía Fernández/ }).click()
  const menu = page.getByRole('dialog', { name: 'Plantillas de WhatsApp' })
  await expect(menu.getByText('Equipo recibido en taller')).toBeVisible()
  await expect(menu.getByRole('alert')).toHaveCount(0)
  await expect(menu.getByText('Reintentar')).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/oscuro-02-plantillas.png` })
  await page.keyboard.press('Escape')

  const filaDiag = page.getByTestId('servicio-fila').filter({ hasText: 'OS-#0001' }).first()
  await filaDiag.getByRole('button', { name: /Ver detalle de/ }).click()
  await expect(page.getByTestId('taller-detalle')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/oscuro-03-detalle.png` })
})

test('taller demo: lista, modal y detalle en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrirDemo(page)
  await irAlTaller(page)
  await page.screenshot({ path: `${SHOTS}/movil-01-lista.png` })

  await page.getByRole('button', { name: '+ Nueva orden' }).click()
  const modal = page.getByRole('dialog', { name: 'Nueva orden de servicio' })
  await expect(modal.getByRole('button', { name: 'Crear orden' })).toBeInViewport()
  await page.screenshot({ path: `${SHOTS}/movil-02-modal.png` })
  await modal.getByRole('button', { name: 'Cancelar' }).click()

  const fila = page.getByTestId('servicio-fila').filter({ hasText: 'OS-#0001' }).first()
  await fila.getByRole('button', { name: /Ver detalle de/ }).click()
  await expect(page.getByTestId('taller-detalle')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/movil-03-detalle.png` })
})
