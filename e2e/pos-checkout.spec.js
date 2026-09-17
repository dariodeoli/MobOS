// Full POS checkout through the real API as the seeded seller (PIN 2468):
// search product → add to cart → review → split payment across two payment
// accounts → save → success banner → sale appears in /pos/pedidos.
//
// The checkout uses the account-based payment rows (Cuenta de cobro +
// Monto original); the legacy method-only fallback only renders when the
// tenant has no payment accounts and is not exercised here.

import { test, expect } from '@playwright/test'
import { SEED } from './helpers/seed-data.js'

const customerName = `${SEED.checkoutCustomer} ${Date.now().toString(36)}`
const API = `http://localhost:${process.env.MOBOS_E2E_API_PORT || '3001'}`

async function orderItems(page, name) {
  return page.evaluate(async ({ api, customer }) => {
    const response = await fetch(`${api}/api/orders`, { credentials: 'include' })
    if (!response.ok) return { status: response.status }
    const rows = await response.json()
    const order = rows.find(row => row.customer?.name === customer)
    return order ? order.items.map(item => ({ listPricePyg: item.listPricePyg, unitPricePyg: item.unitPricePyg })) : null
  }, { api: API, customer: name })
}

test('POS checkout with split payment registers the sale and lists it in pedidos', async ({ page }) => {
  await page.goto('/pos/cargar')
  await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible()

  // Step 1: customer + product.
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(customerName)
  const search = page.getByLabel('Buscar producto por texto')
  await search.fill('Cable')
  const productCard = page.getByRole('button', { name: new RegExp(SEED.products.cable.name) })
  await expect(productCard).toBeVisible()
  // Un clic agrega el producto a la lista de la venta.
  await productCard.click()
  await expect(page.getByText('Seleccionados')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Revisar carrito', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Revisar carrito', exact: true }).click()

  // Step 2: cart review.
  await expect(page.getByText(SEED.products.cable.name).last()).toBeVisible()
  await page.getByRole('button', { name: 'Ir a cobrar' }).click()

  // Step 3: payments. The seeded tenant has two PYG accounts (CASH and
  // TRANSFER), so the account-based rows are used.
  const addPayment = page.getByRole('button', { name: '+ Agregar pago' })
  await expect(addPayment).toBeEnabled()
  const paymentsSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  const accountSelects = paymentsSection.getByLabel('Cuenta de cobro')
  const amountInputs = paymentsSection.getByLabel('Monto original')

  // Partial payment on the first account (cash).
  await addPayment.click()
  await expect(accountSelects).toHaveCount(1)
  await accountSelects.nth(0).selectOption({ label: 'Caja E2E · PYG · CASH' })
  await amountInputs.nth(0).fill('25000')
  await expect(paymentsSection.getByText('Equivalente: Gs 25.000')).toBeVisible()

  // Second payment account covers the remainder.
  await addPayment.click()
  await expect(accountSelects).toHaveCount(2)
  await accountSelects.nth(1).selectOption({ label: 'Transferencia E2E · PYG · TRANSFER' })
  await amountInputs.nth(1).fill('20000')
  await expect(paymentsSection.getByText('Equivalente: Gs 20.000')).toBeVisible()

  // Totals must balance before saving.
  const pendiente = paymentsSection.getByText('Pendiente').first()
  await expect(pendiente.locator('strong')).toHaveText('Gs 0')

  // Delivery notes are optional: the backend accepts an omitted empty note
  // (fixed in the Phase-3 merge), so no observation is required here.
  await page.getByRole('button', { name: /^Guardar venta/ }).click()

  // Success banner with print actions.
  const banner = page.getByRole('status').filter({ hasText: 'Venta registrada correctamente. Ya podés cargar la siguiente.' })
  await expect(banner).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Imprimir A4' })).toBeVisible()
  await expect(banner.getByRole('button', { name: 'Imprimir térmico' })).toBeVisible()

  // The sale shows up in the seller's order list.
  await page.goto('/pos/pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()
  const sale = page.getByTestId('pedido-fila').filter({ hasText: customerName }).first()
  await expect(sale).toBeVisible()
  await expect(sale).toContainText('artículo')
  await expect(sale.getByText('Pagado', { exact: true })).toBeVisible()
})

// Sin límite de productos: cada clic suma una fila a la venta y el total
// se recalcula con los tres productos juntos.
test('POS keeps every clicked product in the sale list', async ({ page }) => {
  await page.goto('/pos/cargar')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(`${SEED.checkoutCustomer} tres ${Date.now().toString(36)}`)

  const search = page.getByLabel('Buscar producto por texto')
  const elegidos = [SEED.products.cable, SEED.products.funda, SEED.products.auris]
  for (const producto of elegidos) {
    await search.fill(producto.name)
    await page.getByRole('button', { name: new RegExp(producto.name) }).click()
    await expect(page.getByLabel(`Cantidad de ${producto.name}`)).toBeVisible()
  }

  const total = elegidos.reduce((sum, producto) => sum + producto.pricePyg, 0)
  await expect(page.getByText(`Gs ${total.toLocaleString('es-PY')}`).first()).toBeVisible()
})

// Cliente: búsqueda por razón social de facturación, selección con marca
// visible, precarga de la factura y "Quitar cliente" sin recargar la página.
test('POS finds a customer by billing name, shows the selection and clears it', async ({ page }) => {
  const stamp = Date.now().toString(36)
  const name = `${SEED.checkoutCustomer} factura ${stamp}`
  const razon = `Empresa E2E ${stamp}`
  await page.goto('/pos/cargar')
  const creado = await page.evaluate(async ({ api, name, razon }) => {
    const response = await fetch(`${api}/api/customers`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, billingName: razon, billingDocument: '80012345-6' }),
    })
    return response.ok ? await response.json() : { status: response.status }
  }, { api: API, name, razon })
  expect(creado?.id).toBeTruthy()

  const buscador = page.getByLabel('Nombre, teléfono, CI o RUC del cliente')

  // La búsqueda llega por la razón social que salió en la factura.
  await buscador.fill(razon)
  await page.getByRole('button', { name: new RegExp(name) }).click()

  const seleccion = page.getByText('Cliente seleccionado')
  await expect(seleccion).toBeVisible()

  // La factura guardada en la ficha se propone de nuevo en esta venta.
  await page.getByText('Factura a otro titular (opcional)').click()
  await expect(page.getByLabel('Nombre del titular de factura')).toHaveValue(razon)
  await expect(page.getByLabel('RUC del titular de factura')).toHaveValue('80012345-6')

  await page.getByRole('button', { name: '× Quitar cliente' }).click()
  await expect(seleccion).toHaveCount(0)
  await expect(buscador).toHaveValue('')
})

// Precio manual por debajo de lista: la venta guarda el precio de lista y el
// comprobante muestra el descuento; por encima de lista se muestra normal.
test('POS manual price below list stores the list price for the receipt', async ({ page }) => {
  const name = `${SEED.checkoutCustomer} manual ${Date.now().toString(36)}`
  await page.goto('/pos/cargar')
  await page.getByLabel('Nombre, teléfono, CI o RUC del cliente').fill(name)

  await page.getByLabel('Buscar producto por texto').fill('Cable')
  await page.getByRole('button', { name: new RegExp(SEED.products.cable.name) }).click()

  // Precio manual 40.000 sobre lista 45.000: la fila marca el descuento.
  await page.getByLabel(`Precio de venta de ${SEED.products.cable.name}`).fill('40000')
  await expect(page.getByText('descuento − Gs 5.000')).toBeVisible()

  await page.getByRole('button', { name: 'Revisar carrito', exact: true }).click()
  await page.getByRole('button', { name: 'Ir a cobrar' }).click()

  const paymentsSection = page.locator('div.space-y-3').filter({ has: page.getByText('Pagos de esta venta') })
  await page.getByRole('button', { name: '+ Agregar pago' }).click()
  await paymentsSection.getByLabel('Cuenta de cobro').selectOption({ label: 'Caja E2E · PYG · CASH' })
  await paymentsSection.getByLabel('Monto original').fill('40000')
  await expect(paymentsSection.getByText('Equivalente: Gs 40.000')).toBeVisible()

  await page.getByRole('button', { name: /^Guardar venta/ }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada correctamente.' })).toBeVisible()

  await expect.poll(async () => orderItems(page, name)).toEqual([{ listPricePyg: SEED.products.cable.pricePyg, unitPricePyg: 40000 }])
})
