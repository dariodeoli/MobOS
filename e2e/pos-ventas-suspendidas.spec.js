// Ventas suspendidas del POS (#107): con la sesión sembrada del vendedor, se
// arma un carrito, se suspende desde el diálogo, se lista por sucursal con
// cliente y total, y se recupera dejando la línea de vuelta en la venta.
// La recuperación no cobra: el stock de los e2e compartidos no se toca.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

test('POS: suspende una venta armada y la recupera desde ventas suspendidas', async ({ page }) => {
  const etiqueta = `Espera E2E ${Date.now().toString(36)}`
  const customerName = `Cliente Suspendido ${Date.now().toString(36)}`

  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(customerName)
  await page.getByPlaceholder('Buscar producto…').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()
  await expect(page.getByText('Seleccionados')).toBeVisible()

  // Suspender la venta en curso con etiqueta.
  await page.getByRole('button', { name: 'Suspender venta' }).click()
  const dialogoSuspender = page.getByRole('dialog', { name: 'Suspender venta' })
  await dialogoSuspender.getByLabel('Etiqueta (opcional)').fill(etiqueta)
  await dialogoSuspender.getByRole('button', { name: 'Suspender venta' }).click()

  // El aviso confirma la suspensión y el carrito queda vacío.
  await expect(page.getByRole('status').filter({ hasText: 'Venta suspendida' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suspender venta' })).toHaveCount(0)

  // La lista de la sucursal identifica cliente, total y quién la suspendió.
  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  const lista = page.getByRole('dialog', { name: 'Ventas suspendidas' })
  const fila = lista.getByRole('article').filter({ hasText: etiqueta })
  await expect(fila).toBeVisible()
  await expect(fila).toContainText(customerName)
  await expect(fila).toContainText(/Total Gs [\d.]+/)
  await expect(fila).toContainText('Vendedor E2E Uno')

  // Recuperar: la venta vuelve al carrito y desaparece de la lista.
  await fila.getByRole('button', { name: 'Recuperar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta recuperada' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suspender venta' })).toBeVisible()
  await expect(lista).not.toBeVisible()

  await page.getByRole('button', { name: 'Ventas suspendidas' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Ventas suspendidas' }).getByRole('article').filter({ hasText: etiqueta }),
  ).toHaveCount(0)
})
