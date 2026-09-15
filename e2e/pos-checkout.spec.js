// Full POS checkout through the real API as the seeded seller (PIN 2468):
// search product → add to cart → review → partial payment + second payment
// account → save → success banner → sale appears in /pos/pedidos.
//
// BUG legacy-payments-no-accountid: when a tenant has no payment accounts,
// FormularioVenta falls back to the legacy payment rows, which send
// originalAmount/exchangeRatePyg WITHOUT accountId; the backend rejects that
// with "Los campos de moneda requieren accountId." (backend/lib/payment-input.ts)
// and the seller cannot save the sale. That path is exercised indirectly by
// the seeded tenant only after removing the accounts. TODO: fix the legacy
// mapping (send method/amountPyg only) or drop the legacy fallback.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const customerName = `${SEED.checkoutCustomer} ${Date.now().toString(36)}`

test('POS checkout with split payment registers the sale and lists it in pedidos', async ({ page }) => {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // Step 1: customer + product.
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(customerName)
  const search = page.getByLabel('Buscar producto por texto')
  await search.fill('Cable')
  const productCard = page.getByRole('button', { name: new RegExp(SEED.products.cable.name) })
  await expect(productCard).toBeVisible()
  await productCard.click()

  await page.getByRole('button', { name: 'Agregar a la lista' }).click()
  await expect(page.getByRole('button', { name: 'Revisar carrito', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Revisar carrito', exact: true }).click()

  // Step 2: cart review.
  await expect(page.getByText(SEED.products.cable.name).last()).toBeVisible()
  await page.getByRole('button', { name: 'Ir a cobrar' }).click()

  // Step 3: payments. The seeded tenant has two PYG accounts, so the
  // account-based rows are used (Cuenta de cobro + Monto original).
  const addPayment = page.getByRole('button', { name: '+ Agregar pago' })
  await expect(addPayment).toBeEnabled()
  const paymentsSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  const rows = paymentsSection.locator('> div.grid').filter({ has: page.locator('input') })

  // Partial payment on the first account.
  await addPayment.click()
  await expect(rows).toHaveCount(1)
  await rows.nth(0).getByLabel('Cuenta de cobro').selectOption({ index: 1 })
  await rows.nth(0).getByLabel('Monto original').fill('25000')
  await expect(rows.nth(0).getByText('Equivalente: Gs 25.000')).toBeVisible()

  // Second payment account covers the remainder.
  await addPayment.click()
  await expect(rows).toHaveCount(2)
  await rows.nth(1).getByLabel('Cuenta de cobro').selectOption({ index: 2 })
  await rows.nth(1).getByLabel('Monto original').fill('20000')
  await expect(rows.nth(1).getByText('Equivalente: Gs 20.000')).toBeVisible()

  // Totals must balance before saving.
  await expect(page.locator('span').filter({ hasText: 'Pendiente' }).first().getByText('0')).toBeVisible()

  // BUG delivery-notes-required: the backend rejects empty deliveryNotes
  // ("Observaciones de entrega debe ser texto no vacío de hasta 2000
  // caracteres.") and the form always sends the field, so a sale without an
  // observation note fails. TODO: send undefined when empty (form) or accept
  // empty strings (backend). Until then the note is required.
  await page.getByPlaceholder('Notas, color, envío vía encomienda, etc.').fill('Venta E2E automatizada')

  await page.getByRole('button', { name: /^Guardar venta/ }).click()

  // Success banner with print actions.
  const banner = page.getByRole('status').filter({ hasText: 'Venta registrada correctamente. Ya podés cargar la siguiente.' })
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Imprimir A4' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Imprimir térmico' })).toBeVisible()

  // The sale shows up in the seller's order list.
  await page.goto('/pos/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  const sale = page.locator('li').filter({ hasText: customerName }).first()
  await expect(sale).toBeVisible()
  await expect(sale.getByText('Total del pedido:')).toBeVisible()
  await expect(sale.getByText('Pago: Pagado')).toBeVisible()
})
