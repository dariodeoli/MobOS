// Caja con turno por usuario y arqueo por denominación (#103): con la sesión
// sembrada del dueño se abre el turno, se carga el desglose de billetes y
// monedas, el total contado se calcula solo, se cierra y el cierre impreso
// lleva el arqueo; el QR del comprobante abre la verificación pública.

import { test, expect } from '@playwright/test'

const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

test('caja: arqueo por denominación, cierre con comprobante y verificación por QR', async ({ page }) => {
  await page.goto('/finanzas/caja')
  await expect(page.getByRole('heading', { name: 'Caja', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Abrir caja|Cerrar caja/ })).toBeVisible()

  // Otra spec o una corrida previa pueden dejar el turno abierto: se cierra.
  if (await page.getByRole('heading', { name: 'Cerrar caja' }).isVisible()) {
    await page.locator('#counted').fill('0')
    await page.getByRole('button', { name: /Cerrar caja/ }).click()
    await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()
  }

  await page.locator('#opening').fill('100000')
  await page.getByRole('button', { name: 'Abrir caja', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cerrar caja' })).toBeVisible()

  // Arqueo por denominación: 1×100.000 + 1×50.000 + 1×20.000 = 170.000.
  await page.locator('#arqueo-100000').fill('1')
  await page.locator('#arqueo-50000').fill('1')
  await page.locator('#arqueo-20000').fill('1')
  await expect(page.locator('#counted')).toHaveValue('170.000')
  await expect(page.getByText('Se calcula sumando las denominaciones cargadas.')).toBeVisible()

  await page.getByRole('button', { name: /Cerrar caja/ }).click()
  await expect(page.getByRole('heading', { name: 'Abrir caja' })).toBeVisible()
  await expect(page.getByText('Cerrada', { exact: true }).first()).toBeVisible()

  // El cierre impreso lleva el arqueo y la leyenda del documento no fiscal.
  await page.getByRole('button', { name: 'Imprimir cierre' }).click()
  const vista = page.frameLocator('iframe[title="Vista previa · Cierre de caja"]')
  await expect(vista.getByText('Arqueo por denominación')).toBeVisible()
  await expect(vista.getByText(/Total del arqueo/)).toBeVisible()
  await expect(vista.getByText(/Documento de control interno/)).toBeVisible()
  await page.keyboard.press('Escape')

  // El QR del comprobante abre la verificación pública del mismo cierre.
  const token = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/cash`, { credentials: 'include' })
    if (!response.ok) return null
    const data = await response.json()
    return data?.session?.publicToken || data?.publicToken || null
  }, API)
  expect(token).toBeTruthy()

  await page.goto(`/caja/${token}`)
  await expect(page.getByText('Cierre confirmado')).toBeVisible()
  await expect(page.getByText('Comprobante verificado')).toBeVisible()
  await expect(page.getByText('Arqueo por denominación')).toBeVisible()
  await expect(page.getByText(/Gs 100\.000 × 1/)).toBeVisible()
  await expect(page.getByText('Documento no fiscal. No válido como factura.')).toBeVisible()
})
