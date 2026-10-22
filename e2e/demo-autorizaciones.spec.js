// #213 · demo: la experiencia muestra autorizaciones comerciales ficticias
// (pendientes y resueltas) y resolverlas queda simulado, sin llamar al API.
import { test, expect } from '@playwright/test'
import { cerrarGuiaDemo } from './helpers/demo.js'

test('la demo muestra autorizaciones ficticias y las resuelve simulado', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (/\/api\/authorizations/.test(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)

  // Sin pestaña en la URL abre la primera con pendientes (Precios, por el descuento).
  await page.goto('/autorizaciones')
  const filas = page.getByTestId('autorizacion-fila')
  await expect(page.getByTestId('autorizaciones-tab-precios')).toHaveAttribute('aria-selected', 'true', { timeout: 20_000 })
  await expect(filas).toHaveCount(3)
  await expect(page.getByText(/Datos ficticios: las solicitudes son de ejemplo/)).toBeVisible()
  // 2 solicitudes comerciales + 4 pagos por verificar de ejemplo.
  await expect(page.getByText('6 pendientes')).toBeVisible()
  await page.getByTestId('autorizaciones-tab-credito').click()
  await expect(filas).toHaveCount(1)

  // Aprobar la primera pendiente (crédito): modal, resolución simulada.
  await filas.first().getByRole('button', { name: 'Aprobar' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  await modal.getByRole('button', { name: 'Aprobar' }).click()
  await expect(page.getByText(/queda simulada/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('5 pendientes')).toBeVisible()
  expect(llamadas, `llamadas al API de autorizaciones: ${llamadas.join(', ')}`).toEqual([])
})

// Pagos por verificar y verificación diaria de la demo: cobros PIX/transferencia con
// comprobante ficticio, uno rechazado y un día con discrepancia; todo simulado.
test('la demo muestra pagos por verificar y la verificación del día con datos', async ({ page }) => {
  const llamadas = []
  page.on('request', (req) => { if (/\/api\/(payments|authorizations)/.test(req.url())) llamadas.push(req.url()) })

  await page.goto('/demo')
  await page.getByRole('button', { name: /Entrar como Dueño/ }).first().click()
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'))
  await cerrarGuiaDemo(page)

  await page.goto('/autorizaciones?tab=pagos')
  const tarjetas = page.getByTestId('pago-verificar-tarjeta')
  await expect(tarjetas).toHaveCount(4, { timeout: 20_000 })
  const pix = tarjetas.filter({ hasText: '04231' })
  await expect(pix.getByTestId('comprobante-miniatura')).toBeVisible()
  await pix.getByTestId('comprobante-miniatura').click()
  const visor = page.getByRole('dialog', { name: 'Comprobante de pago' })
  await expect(visor).toBeVisible()
  await visor.getByRole('button', { name: 'Cerrar' }).click()
  await expect(visor).toBeHidden()

  // Aprobar uno: queda simulado y baja el contador.
  await pix.getByRole('button', { name: 'Aprobar' }).click()
  await page.getByRole('alertdialog', { name: 'Aprobar el pago' }).getByRole('button', { name: 'Aprobar pago' }).click()
  await expect(tarjetas).toHaveCount(3, { timeout: 10_000 })
  await page.getByRole('button', { name: /^Rechazados/ }).click()
  await expect(page.getByTestId('pago-verificar-tarjeta').first()).toContainText('El monto del comprobante no coincide con el banco.')

  // Verificación del día: categorías, estado «con discrepancias» y verificar categoría.
  await page.goto('/finanzas/verificacion-dia')
  await expect(page.getByTestId('verificacion-estado-dia')).toHaveText('Con discrepancias', { timeout: 20_000 })
  await expect(page.getByTestId('verificacion-categoria')).not.toHaveCount(0)
  await expect(page.getByTestId('discrepancia-fila').first()).toContainText('La procesadora retuvo la comisión del lote.')
  const efectivo = page.locator('[data-testid="verificacion-categoria"][data-categoria="CASH"]')
  await efectivo.getByTestId('verificar-categoria').click()
  await page.getByRole('alertdialog', { name: /Verificar Efectivo/ }).getByRole('button', { name: 'Verificar' }).click()
  await expect(page.getByTestId('verificacion-resultado')).toContainText('3 verificados', { timeout: 10_000 })
  expect(llamadas, `la demo no llama al API: ${llamadas.join(', ')}`).toEqual([])
})
