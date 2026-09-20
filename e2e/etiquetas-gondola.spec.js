// Etiquetas de góndola (#97): el modal elige productos y cantidad, y el
// respaldo del diálogo imprime el HTML con el SKU y el precio correctos. Sin
// agente local y sin impresora remota, el envío cae al diálogo del navegador
// (iframe oculto con el HTML generado).

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test.describe('etiquetas de góndola', () => {
  test('el modal imprime el SKU y el precio del producto elegido por el diálogo', async ({ page }) => {
    await page.route('http://127.0.0.1:17890/**', (ruta) => ruta.abort())
    // Sin impresora configurada el trabajo no se encola al puente: cae al
    // diálogo con el HTML generado, que es lo que verifica este test.
    await page.route('**/api/print/printers', (ruta) => ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ printers: [], bridges: [], remoteEnabled: true }),
    }))

    await page.goto('/inventario/unidades')
    await page.getByRole('button', { name: 'Etiquetas de góndola' }).click()
    const modal = page.getByRole('dialog', { name: 'Etiquetas de góndola' })
    await expect(modal).toBeVisible()

    // La lista de productos hidrata desde la API: esperar el producto sembrado.
    await expect(modal.getByText(SEED.products.cable.name)).toBeVisible({ timeout: 20_000 })
    await modal.getByLabel('Buscar por nombre o SKU').fill(SEED.products.cable.sku)
    await modal.getByRole('checkbox', { name: `Seleccionar ${SEED.products.cable.name}` }).check()
    await modal.getByLabel(`Cantidad de etiquetas de ${SEED.products.cable.name}`).fill('2')
    await modal.getByRole('button', { name: 'Imprimir etiquetas' }).click()

    const marco = page.locator('iframe[aria-hidden="true"]').last().contentFrame()
    await expect(marco.locator('body')).toContainText(SEED.products.cable.sku)
    await expect(marco.locator('body')).toContainText('Gs 45.000')
    await expect(marco.locator('body')).toContainText('Etiqueta 2 de 2')
  })
})
