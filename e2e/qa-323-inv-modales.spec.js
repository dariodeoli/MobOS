// #323 · Adopción del modal/drawer estándar en INV: etiquetas visibles, error
// junto al campo (adentro del diálogo, no detrás del overlay) y cierre con
// confirmación cuando hay cambios sin guardar.
// Corre en el demo anónimo del Dueño. Evidencia en docs/qa/323-inv-modales/.
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { cerrarGuiaDemo } from './helpers/demo.js'

const DIR = join('docs', 'qa', '323-inv-modales')

async function entrarDemo(page) {
  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)
}

test('#323 · recibir unidad: etiquetas visibles, error adentro y cierre con cambios', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await page.goto('/inventario/unidades')

  await page.getByRole('button', { name: '+ Recibir unidad' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
  await expect(dialogo).toBeVisible()

  // #323: cada campo del diálogo lleva su etiqueta visible (antes solo
  // aria-label en Sucursal/Ubicación/Condición/Batería/Importe).
  for (const etiqueta of ['Sucursal', 'Ubicación', 'Condición', 'Batería']) {
    await expect(dialogo.getByLabel(etiqueta, { exact: true })).toBeVisible()
  }
  await expect(dialogo.getByText('IMEI / serial *', { exact: true })).toBeVisible()
  await expect(dialogo.getByText('Importe', { exact: true })).toBeVisible()
  await expect(dialogo.getByLabel('IMEI o serial', { exact: true })).toBeVisible()
  await expect(dialogo.getByLabel('Monto del costo', { exact: true })).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recibir-unidad-1440-light.png') })

  // El error vive adentro del diálogo y junto al campo (antes quedaba en el
  // Aviso general de la página, detrás del overlay).
  await dialogo.getByLabel('Sucursal', { exact: true }).selectOption({ index: 1 })
  await dialogo.getByRole('button', { name: 'Guardar unidad' }).click()
  await expect(dialogo.getByText('Indicá al menos un IMEI/serial.')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recibir-unidad-error-1440-light.png') })

  // Con datos cargados, cerrar pide confirmación (dirty del objeto estándar).
  await dialogo.getByLabel('IMEI o serial', { exact: true }).fill('DEMOQA0000000001')
  await page.keyboard.press('Escape')
  const descarte = page.getByRole('dialog', { name: '¿Descartar los cambios?' })
  await expect(descarte).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recibir-unidad-descarte-1440-light.png') })
  await descarte.getByRole('button', { name: 'Descartar y cerrar' }).click()
  await expect(dialogo).toHaveCount(0)

  // En móvil el pie del diálogo queda fijo y las etiquetas siguen visibles.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '+ Recibir unidad' }).click()
  const movil = page.getByRole('dialog', { name: 'Carga rápida de unidad' })
  await expect(movil).toBeVisible()
  await expect(movil.getByRole('button', { name: 'Guardar unidad' })).toBeVisible()
  await expect(movil.getByText('Importe', { exact: true })).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recibir-unidad-390-light.png') })
})

test('#323 · recibir mercadería usa el pie estándar y no marca cambios en la demo', async ({ page }) => {
  mkdirSync(DIR, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await entrarDemo(page)
  await page.goto('/compras')

  const fila = page.getByTestId('compra-fila').filter({ hasText: 'Distribuidora del Este' })
  await fila.getByRole('button', { name: 'Recibir mercadería' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Recibir mercadería' })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText('La recepción parcial requiere conexión con el servidor')).toBeVisible()
  await expect(dialogo.getByRole('button', { name: 'Recibir todo' })).toBeVisible()
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeVisible()
  await page.screenshot({ path: join(DIR, 'recibir-mercaderia-demo-1440-light.png') })

  // Sin campos editables en la demo no hay nada que perder: cierra sin
  // confirmación de descarte.
  await page.keyboard.press('Escape')
  await expect(dialogo).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '¿Descartar los cambios?' })).toHaveCount(0)
})
